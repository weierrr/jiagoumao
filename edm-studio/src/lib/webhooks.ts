import { createHmac, createHash } from "node:crypto";
import { Webhook } from "svix";
import type { Prisma } from "@prisma/client";
import { db, STORE_ID, DEMO } from "./db";
import { safeEqual, HttpError } from "./auth";
import { normalizeEmail } from "./domain";
export function verifyShopify(
  raw: string,
  signature: string | null,
  secret = process.env.SHOPIFY_WEBHOOK_SECRET,
) {
  if (!secret || !signature) return false;
  return safeEqual(
    createHmac("sha256", secret).update(raw).digest("base64"),
    signature,
  );
}
export function verifyResend(
  raw: string,
  headers: Record<string, string>,
  secret = process.env.RESEND_WEBHOOK_SECRET,
) {
  if (!secret) throw new HttpError(401, "缺少 Webhook 验签密钥");
  return new Webhook(secret).verify(raw, headers) as Record<string, any>;
}
export async function suppress(
  tx: Prisma.TransactionClient,
  email: string,
  reason: string,
  source: string,
  eventId: string,
) {
  const normalized = normalizeEmail(email);
  await tx.suppression.upsert({
    where: { storeId_email: { storeId: STORE_ID, email: normalized } },
    create: { storeId: STORE_ID, email: normalized, reason, source },
    update: {},
  });
  const contact = await tx.contact.findUnique({
    where: { storeId_email: { storeId: STORE_ID, email: normalized } },
  });
  if (!contact) return;
  await tx.contact.update({
    where: { id: contact.id },
    data: {
      marketingState: "UNSUBSCRIBED",
      suppressedAt: contact.suppressedAt || new Date(),
      unsubscribedAt: contact.unsubscribedAt || new Date(),
    },
  });
  await tx.consentHistory.upsert({
    where: {
      storeId_contactId_provider_sourceEventId: {
        storeId: STORE_ID,
        contactId: contact.id,
        provider: source,
        sourceEventId: eventId,
      },
    },
    create: {
      storeId: STORE_ID,
      contactId: contact.id,
      provider: source,
      sourceEventId: eventId,
      oldState: contact.marketingState,
      newState: "UNSUBSCRIBED",
      source: reason,
      occurredAt: new Date(),
    },
    update: {},
  });
  await tx.abandonedCheckout.updateMany({
    where: { storeId: STORE_ID, contactId: contact.id, sentAt: null },
    data: { reminderStatus: "cancelled" },
  });
  await tx.workflowExecution.updateMany({
    where: {
      storeId: STORE_ID,
      contactId: contact.id,
      status: { in: ["pending", "waiting"] },
    },
    data: { status: "cancelled" },
  });
  await tx.outboxJob.upsert({
    where: { key: `deny:${STORE_ID}:${source}:${eventId}:${contact.id}` },
    create: {
      storeId: STORE_ID,
      key: `deny:${STORE_ID}:${source}:${eventId}:${contact.id}`,
      kind: "sync_denial",
      payloadJson: JSON.stringify({ contactId: contact.id, source }),
    },
    update: {},
  });
}
export async function receiveWebhook(
  provider: "shopify" | "resend",
  request: Request,
) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1024 * 1024)
    throw new HttpError(413, "Webhook 请求过大");
  let payload: Record<string, any>;
  let eventId: string;
  let topic: string;
  if (provider === "shopify") {
    if (!verifyShopify(raw, request.headers.get("x-shopify-hmac-sha256")))
      throw new HttpError(401, "Shopify 签名无效");
    const expected = process.env.SHOPIFY_SHOP_DOMAIN;
    if (!expected || request.headers.get("x-shopify-shop-domain") !== expected)
      throw new HttpError(403, "店铺不匹配");
    eventId = request.headers.get("x-shopify-webhook-id") || "";
    topic = request.headers.get("x-shopify-topic") || "";
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Webhook JSON 格式无效");
    }
  } else {
    try {
      payload = verifyResend(raw, Object.fromEntries(request.headers));
    } catch {
      throw new HttpError(401, "Resend 签名无效或已过期");
    }
    eventId = request.headers.get("svix-id") || "";
    topic = payload.type;
  }
  if (!eventId || !topic) throw new HttpError(400, "缺少事件 ID 或主题");
  const hash = createHash("sha256").update(raw).digest("hex");
  try {
    return await db.$transaction(async (tx) => {
      await tx.webhookReceipt.create({
        data: {
          storeId: STORE_ID,
          provider,
          eventId,
          topic,
          rawBodyHash: hash,
        },
      });
      const data = provider === "resend" ? payload.data || {} : payload;
      const state =
        data.email_marketing_consent?.state ||
        data.email_marketing_consent?.marketing_state ||
        data.marketing_state;
      const deny =
        provider === "shopify"
          ? (state &&
              ["UNSUBSCRIBED", "REDACTED", "INVALID"].includes(
                state.toUpperCase(),
              )) ||
            ["customers/delete", "customers/redact"].includes(topic)
          : ["suppression.added", "email.bounced", "email.complained"].includes(
              topic,
            ) ||
            data.unsubscribed === true ||
            (topic === "contact.topics.updated" &&
              JSON.stringify(data).includes("opt_out"));
      if (deny) {
        const emails = new Set<string>();
        if (typeof data.email === "string") emails.add(data.email);
        for (const email of Array.isArray(data.to)
          ? data.to
          : typeof data.to === "string"
            ? [data.to]
            : [])
          emails.add(email);
        if (
          provider === "shopify" &&
          (data.customer_id || data.customer?.id || data.id)
        ) {
          const c = await tx.contact.findFirst({
            where: {
              storeId: STORE_ID,
              shopifyCustomerGid: `gid://shopify/Customer/${data.customer_id || data.customer?.id || data.id}`,
            },
          });
          if (c) emails.add(c.email);
        }
        if (
          provider === "resend" &&
          (data.contact_id || (topic.startsWith("contact.") && data.id))
        ) {
          const c = await tx.contact.findFirst({
            where: {
              storeId: STORE_ID,
              resendContactId: data.contact_id || data.id,
            },
          });
          if (c) emails.add(c.email);
        }
        if (provider === "resend" && data.email_id) {
          const previous = await tx.emailEvent.findFirst({
            where: {
              storeId: STORE_ID,
              resendEmailId: data.email_id,
              contactId: { not: null },
            },
          });
          if (previous?.contactId) {
            const c = await tx.contact.findUnique({
              where: { id: previous.contactId },
            });
            if (c) emails.add(c.email);
          }
        }
        for (const email of emails)
          await suppress(tx, email, topic, provider, eventId);
        // Unknown recipient on a negative event is a store-level stop until investigated.
        if (!emails.size) {
          await tx.store.update({
            where: { id: STORE_ID },
            data: { liveEnabled: false },
          });
          await tx.auditLog.create({
            data: {
              storeId: STORE_ID,
              action: "safety.stop",
              detail: `无法映射负向事件 ${provider}:${eventId}`,
            },
          });
        }
      }
      const sanitized =
        provider === "shopify" && topic.startsWith("orders/")
          ? {
              id: data.id,
              customer: { id: data.customer?.id },
              email: data.email,
              created_at: data.created_at,
              cancelled_at: data.cancelled_at,
              financial_status: data.financial_status,
              total_price: data.total_price,
              currency: data.currency,
            }
          : provider === "shopify"
            ? {
                id: data.id,
                customer_id: data.customer_id,
                email: data.email,
                first_name: data.first_name,
                last_name: data.last_name,
                tags: data.tags,
                updated_at: data.updated_at,
                orders_count: data.orders_count,
                total_spent: data.total_spent,
                email_marketing_consent: data.email_marketing_consent,
                marketing_state: data.marketing_state,
                customer: data.customer ? { id: data.customer.id } : undefined,
              }
            : {
                type: topic,
                created_at: payload.created_at,
                data: {
                  email: data.email,
                  email_id: data.email_id,
                  contact_id: data.contact_id,
                  id: data.id,
                  to: data.to,
                  unsubscribed: data.unsubscribed,
                },
              };
      await tx.outboxJob.create({
        data: {
          storeId: STORE_ID,
          key: `webhook:${STORE_ID}:${provider}:${eventId}`,
          kind: "webhook",
          payloadJson: JSON.stringify({
            provider,
            eventId,
            topic,
            payload: sanitized,
          }),
        },
      });
      return { accepted: true, duplicate: false };
    });
  } catch (error: any) {
    if (error.code !== "P2002") throw error;
    const existing = await db.webhookReceipt.findUnique({
      where: {
        storeId_provider_eventId: { storeId: STORE_ID, provider, eventId },
      },
    });
    if (existing?.rawBodyHash !== hash)
      throw new HttpError(409, "同一事件 ID 的内容不一致");
    return { accepted: true, duplicate: true };
  }
}
