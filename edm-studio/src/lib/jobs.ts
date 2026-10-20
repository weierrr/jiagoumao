import { randomUUID } from "node:crypto";
import { db, STORE_ID, DEMO, DRY_RUN, audit } from "./db";
import {
  eligibility,
  normalizeEmail,
  simulate,
  validateWorkflow,
  type Definition,
} from "./domain";
import {
  graphql,
  importCustomer,
  syncCustomers,
  UNSUBSCRIBE_MUTATION,
  CUSTOMER_ORDER_STATE_QUERY,
} from "./shopify";
import { provider, ProviderError } from "./providers";
import { suppress } from "./webhooks";
export async function queue(
  kind: string,
  payload: Record<string, unknown>,
  key = `${kind}:${randomUUID()}`,
) {
  return db.outboxJob.upsert({
    where: { key },
    create: {
      storeId: STORE_ID,
      key,
      kind,
      payloadJson: JSON.stringify(payload),
    },
    update: {},
  });
}
export async function executeWorkflow(
  workflowId: string,
  contactId: string,
  businessEventKey: string,
  options: Record<string, boolean> = {},
) {
  const workflow = await db.workflow.findFirstOrThrow({
    where: { id: workflowId, storeId: STORE_ID },
  });
  const contact = await db.contact.findFirstOrThrow({
    where: { id: contactId, storeId: STORE_ID },
  });
  const definition: Definition = JSON.parse(
    options.live ? workflow.publishedJson || "{}" : workflow.draftJson,
  );
  const templates = await db.emailTemplate.findMany({
    where: { storeId: STORE_ID },
  });
  const check = validateWorkflow(definition, templates);
  if (!check.valid) throw new Error(check.errors.join("；"));
  const existing = await db.workflowExecution.findUnique({
    where: {
      storeId_workflowId_businessEventKey_contactId: {
        storeId: STORE_ID,
        workflowId,
        businessEventKey,
        contactId,
      },
    },
  });
  if (existing)
    return {
      ...existing,
      trace: JSON.parse(existing.traceJson),
      duplicate: true,
    };
  const suppressed = Boolean(
    await db.suppression.findUnique({
      where: { storeId_email: { storeId: STORE_ID, email: contact.email } },
    }),
  );
  const trace = simulate(definition, contact, { ...options, suppressed });
  // A simulation never invokes the live provider, even when live settings are enabled.
  const status = trace.some((t) => t.status === "blocked")
    ? "blocked"
    : "simulated";
  try {
    return await db.$transaction(async (tx) => {
      const latest = await tx.contact.findUniqueOrThrow({
        where: { id: contactId },
      });
      const latestSuppressed = await tx.suppression.findUnique({
        where: { storeId_email: { storeId: STORE_ID, email: latest.email } },
      });
      const finalGate = eligibility(latest, !!latestSuppressed);
      const frequencyHit = await tx.emailEvent.count({
        where: {
          storeId: STORE_ID,
          contactId,
          eventType: "email.simulated",
          occurredAt: { gte: new Date(Date.now() - 86400000) },
        },
      });
      if (!finalGate.allowed || frequencyHit) {
        const send = trace.find((t) => t.status === "simulated");
        if (send) {
          send.status = "blocked";
          send.action = !finalGate.allowed
            ? finalGate.reason
            : "24 小时内已存在发送决策，频率保护阻断";
          trace.splice(trace.indexOf(send) + 1);
        }
      }
      const finalStatus = trace.some((t) => t.status === "blocked")
        ? "blocked"
        : status;
      const execution = await tx.workflowExecution.create({
        data: {
          storeId: STORE_ID,
          workflowId,
          contactId,
          businessEventKey,
          status: finalStatus,
          traceJson: JSON.stringify(trace),
        },
      });
      for (const t of trace.filter(
        (t) => t.status === "simulated" || t.status === "blocked",
      ))
        await tx.emailEvent.create({
          data: {
            storeId: STORE_ID,
            providerEventId: `simulation:${execution.id}:${t.nodeId}`,
            contactId,
            workflowId,
            eventType:
              t.status === "blocked" ? "marketing.blocked" : "email.simulated",
            demo: true,
            metadataJson: JSON.stringify({
              executionId: execution.id,
              reason: t.action,
            }),
          },
        });
      return { ...execution, trace, duplicate: false };
    });
  } catch (e: any) {
    if (e.code !== "P2002") throw e;
    const previous = await db.workflowExecution.findUniqueOrThrow({
      where: {
        storeId_workflowId_businessEventKey_contactId: {
          storeId: STORE_ID,
          workflowId,
          businessEventKey,
          contactId,
        },
      },
    });
    return {
      ...previous,
      trace: JSON.parse(previous.traceJson),
      duplicate: true,
    };
  }
}
async function processWebhook(p: any) {
  const { provider: source, eventId, topic, payload } = p;
  if (source === "resend") {
    const data = payload.data || {};
    const email = data.email || data.to?.[0];
    const contact = email
      ? await db.contact.findUnique({
          where: {
            storeId_email: { storeId: STORE_ID, email: normalizeEmail(email) },
          },
        })
      : null;
    await db.emailEvent.upsert({
      where: {
        storeId_providerEventId: {
          storeId: STORE_ID,
          providerEventId: `resend:${eventId}`,
        },
      },
      create: {
        storeId: STORE_ID,
        providerEventId: `resend:${eventId}`,
        eventType: topic,
        contactId: contact?.id,
        resendEmailId: data.email_id,
        demo: DEMO,
        occurredAt: payload.created_at
          ? new Date(payload.created_at)
          : new Date(),
        metadataJson: JSON.stringify({ source: "resend" }),
      },
      update: {},
    });
  } else if (
    [
      "customers/create",
      "customers/update",
      "customers_email_marketing_consent/update",
    ].includes(topic)
  ) {
    const gid = `gid://shopify/Customer/${payload.customer_id || payload.id}`;
    const old = await db.contact.findFirst({
      where: { storeId: STORE_ID, shopifyCustomerGid: gid },
    });
    const contact = await importCustomer(
      {
        id: gid,
        email: payload.email || old?.email,
        firstName: payload.first_name,
        lastName: payload.last_name,
        tags: payload.tags?.split(",").map((s: string) => s.trim()),
        numberOfOrders: payload.orders_count,
        amountSpent: payload.total_spent
          ? { amount: payload.total_spent }
          : undefined,
        updatedAt: payload.updated_at,
        emailMarketingConsent: {
          marketingState: (
            payload.email_marketing_consent?.state ||
            payload.marketing_state ||
            old?.marketingState ||
            "NOT_SUBSCRIBED"
          ).toUpperCase(),
          consentUpdatedAt:
            payload.email_marketing_consent?.consent_updated_at ||
            payload.updated_at,
        },
      },
      eventId,
      topic,
    );
    if (
      contact &&
      contact.marketingState === "SUBSCRIBED" &&
      old?.marketingState !== "SUBSCRIBED"
    ) {
      const workflows = await db.workflow.findMany({
        where: { storeId: STORE_ID, kind: "welcome", status: "demo_published" },
      });
      for (const w of workflows) {
        const definition = JSON.parse(w.publishedJson || "{}");
        if (
          definition.nodes?.find((n: any) => n.type === "trigger")?.data
            .eventName === "shopify.customer.subscribed"
        )
          await executeWorkflow(w.id, contact.id, `shopify:${eventId}`, {
            live: true,
          });
      }
    }
  } else if (topic.startsWith("orders/")) {
    const contact = payload.customer?.id
      ? await db.contact.findFirst({
          where: {
            storeId: STORE_ID,
            shopifyCustomerGid: `gid://shopify/Customer/${payload.customer.id}`,
          },
        })
      : null;
    if (contact) {
      const gid = `gid://shopify/Order/${payload.id}`;
      const previousOrder = await db.orderSummary.findUnique({
        where: {
          storeId_shopifyOrderGid: { storeId: STORE_ID, shopifyOrderGid: gid },
        },
      });
      await db.orderSummary.upsert({
        where: {
          storeId_shopifyOrderGid: { storeId: STORE_ID, shopifyOrderGid: gid },
        },
        create: {
          storeId: STORE_ID,
          shopifyOrderGid: gid,
          contactId: contact.id,
          financialStatus: payload.financial_status || "unknown",
          placedAt: new Date(payload.created_at),
          currency: payload.currency || "USD",
          totalAmount: Number(payload.total_price || 0),
        },
        update: {
          financialStatus: payload.financial_status,
          cancelledAt: payload.cancelled_at
            ? new Date(payload.cancelled_at)
            : null,
        },
      });
      if (DEMO) {
        await db.contact.update({
          where: { id: contact.id },
          data: {
            ordersCount: previousOrder
              ? contact.ordersCount
              : contact.ordersCount + 1,
            totalSpent:
              contact.totalSpent +
              (Number(payload.total_price || 0) -
                (previousOrder?.totalAmount || 0)),
            lastOrderAt:
              !contact.lastOrderAt ||
              +contact.lastOrderAt < +new Date(payload.created_at)
                ? new Date(payload.created_at)
                : contact.lastOrderAt,
          },
        });
      } else {
        // A partial order window must never replace the customer's all-time aggregates.
        const snapshot = await graphql(CUSTOMER_ORDER_STATE_QUERY, {
          id: contact.shopifyCustomerGid,
        });
        if (!snapshot.customer) throw new Error("订单汇总复核失败：客户不存在");
        await db.contact.update({
          where: { id: contact.id },
          data: {
            ordersCount: Number(snapshot.customer.numberOfOrders),
            totalSpent: Number(snapshot.customer.amountSpent.amount),
            lastOrderAt: snapshot.customer.lastOrder?.createdAt
              ? new Date(snapshot.customer.lastOrder.createdAt)
              : null,
          },
        });
      }
      if (topic === "orders/paid") {
        await db.abandonedCheckout.updateMany({
          where: { storeId: STORE_ID, contactId: contact.id, sentAt: null },
          data: { completedAt: new Date(), reminderStatus: "cancelled" },
        });
        const workflows = await db.workflow.findMany({
          where: {
            storeId: STORE_ID,
            kind: "post-purchase",
            status: "demo_published",
          },
        });
        for (const w of workflows) {
          const definition = JSON.parse(w.publishedJson || "{}");
          if (
            definition.nodes?.find((n: any) => n.type === "trigger")?.data
              .eventName === "shopify.order.paid"
          )
            await executeWorkflow(w.id, contact.id, `shopify:${eventId}`, {
              live: true,
            });
        }
      }
    }
  } else if (
    [
      "customers/redact",
      "customers/delete",
      "shop/redact",
      "customers/data_request",
    ].includes(topic)
  ) {
    // Requests are visible and stop marketing while the operator handles deletion/export with both providers.
    await db.store.update({
      where: { id: STORE_ID },
      data: { liveEnabled: false },
    });
    await audit(
      "privacy.action_required",
      `${topic} 已阻断真实发送，需按数据删除/导出操作手册处理`,
      eventId,
    );
  }
  await db.webhookReceipt.update({
    where: {
      storeId_provider_eventId: {
        storeId: STORE_ID,
        provider: source,
        eventId,
      },
    },
    data: { status: "processed" },
  });
}
async function processJob(job: {
  kind: string;
  payloadJson: string;
  key: string;
}) {
  const p = JSON.parse(job.payloadJson);
  if (job.kind === "webhook") return processWebhook(p);
  if (job.kind === "shopify_sync") {
    if (DEMO) {
      const { seed } = await import("../../prisma/seed");
      await seed();
      await db.store.update({
        where: { id: STORE_ID },
        data: { lastSyncAt: new Date() },
      });
      return audit("demo.sync", "重新载入模拟样本；不覆盖已保存的退订与修改");
    }
    return syncCustomers();
  }
  if (job.kind === "sync_contact" || job.kind === "sync_denial") {
    const c = await db.contact.findFirstOrThrow({
      where: { id: p.contactId, storeId: STORE_ID },
    });
    const blocked = Boolean(
      await db.suppression.findUnique({
        where: { storeId_email: { storeId: STORE_ID, email: c.email } },
      }),
    );
    if (eligibility(c, blocked).allowed && job.kind === "sync_contact") {
      // Never overwrite a known provider unsubscribe with subscribed=false from a stale local sync.
      if (!DRY_RUN)
        throw new Error("真实联系人同步需先完成远端退订对账验收；当前保持阻断");
      const result = await provider.upsertContact(
        { email: c.email, first_name: c.firstName, last_name: c.lastName },
        job.key,
      );
      await db.contact.update({
        where: { id: c.id },
        data: { resendContactId: String(result.id) },
      });
    } else {
      if (c.resendContactId)
        await provider.updateConsent(c.resendContactId, true, job.key);
      if (!DRY_RUN && p.source === "resend" && c.shopifyCustomerGid) {
        const result = await graphql(UNSUBSCRIBE_MUTATION, {
          input: {
            customerId: c.shopifyCustomerGid,
            emailMarketingConsent: {
              marketingState: "UNSUBSCRIBED",
              consentUpdatedAt: new Date().toISOString(),
            },
          },
        });
        if (result.customerEmailMarketingConsentUpdate.userErrors.length)
          throw new Error("Shopify 退订回写失败，请检查 write_customers 权限");
      }
    }
    return;
  }
  throw new Error(`未知任务类型：${job.kind}`);
}
export async function runJobs(limit = 20) {
  // Lease recovery: only safe ingestion/upsert jobs are handled here. Sending is never automatically replayed.
  await db.outboxJob.updateMany({
    where: {
      storeId: STORE_ID,
      status: "processing",
      lockedAt: { lt: new Date(Date.now() - 5 * 60000) },
    },
    data: { status: "pending", lockedAt: null, leaseToken: null },
  });
  const candidates = await db.outboxJob.findMany({
    where: {
      storeId: STORE_ID,
      status: "pending",
      nextRunAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let processed = 0;
  for (const job of candidates) {
    const leaseToken = randomUUID();
    const claim = await db.outboxJob.updateMany({
      where: { id: job.id, status: "pending" },
      data: {
        status: "processing",
        lockedAt: new Date(),
        leaseToken,
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) continue;
    try {
      await processJob(job);
      await db.outboxJob.updateMany({
        where: { id: job.id, leaseToken },
        data: {
          status: "done",
          lockedAt: null,
          leaseToken: null,
          lastError: null,
          payloadJson: "{}",
        },
      });
      processed++;
    } catch (e) {
      const attempts = job.attempts + 1;
      const terminal =
        attempts >= 5 ||
        (e instanceof ProviderError &&
          e.status >= 400 &&
          e.status < 500 &&
          e.status !== 429);
      await db.outboxJob.updateMany({
        where: { id: job.id, leaseToken },
        data: {
          status: terminal ? "dead" : "pending",
          lockedAt: null,
          leaseToken: null,
          lastError: e instanceof Error ? e.message.slice(0, 500) : "任务失败",
          nextRunAt: new Date(
            Date.now() +
              Math.max(
                2 ** attempts * 1000,
                e instanceof ProviderError ? e.retryAfter * 1000 : 0,
              ),
          ),
        },
      });
    }
  }
  return { processed, scanned: candidates.length };
}
