import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, STORE_ID, DEMO, DRY_RUN, audit } from "@/lib/db";
import {
  authenticated,
  appOrigin,
  assertOrigin,
  safeEqual,
  sessionToken,
  HttpError,
  demoLocal,
} from "@/lib/auth";
import {
  eligibility,
  normalizeEmail,
  matchesRules,
  rulesSchema,
  workflowSchema,
  validateWorkflow,
  compileWorkflow,
  type Definition,
} from "@/lib/domain";
import { contentSchema, renderEmail, defaultContent } from "@/lib/email";
import { liveGateErrors, ResendProvider, provider } from "@/lib/providers";
import { receiveWebhook, suppress } from "@/lib/webhooks";
import { executeWorkflow, queue, runJobs } from "@/lib/jobs";
import { graphql, shopDomain } from "@/lib/shopify";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const loginAttempts = new Map<string, { count: number; since: number }>();
const resource = (id: string) => ({ id, storeId: STORE_ID });
const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function body(req: Request) {
  const raw = await req.text();
  if (raw.length > 256000) throw new HttpError(413, "请求过大");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new HttpError(400, "JSON 格式无效");
  }
}
async function metrics() {
  const since = new Date(Date.now() - 7 * 86400000);
  const [contacts, suppressed, events, jobs, executions] = await Promise.all([
    db.contact.findMany({ where: { storeId: STORE_ID } }),
    db.suppression.findMany({ where: { storeId: STORE_ID } }),
    db.emailEvent.findMany({
      where: { storeId: STORE_ID, occurredAt: { gte: since } },
      orderBy: { occurredAt: "asc" },
    }),
    db.outboxJob.groupBy({
      by: ["status"],
      where: { storeId: STORE_ID },
      _count: true,
    }),
    db.workflowExecution.count({ where: { storeId: STORE_ID } }),
  ]);
  const blocked = new Set(suppressed.map((s) => s.email));
  const count = (type: string) =>
    events.filter((e) => e.eventType === type).length;
  const chart = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      delivered: events.filter(
        (e) =>
          e.occurredAt.toISOString().startsWith(date) &&
          e.eventType === "email.delivered",
      ).length,
      clicked: events.filter(
        (e) =>
          e.occurredAt.toISOString().startsWith(date) &&
          e.eventType === "email.clicked",
      ).length,
    };
  });
  return {
    total: contacts.length,
    eligible: contacts.filter(
      (c) => eligibility(c, blocked.has(c.email)).allowed,
    ).length,
    sent: count("email.sent"),
    delivered: count("email.delivered"),
    clicked: count("email.clicked"),
    bounced: count("email.bounced"),
    complained: count("email.complained"),
    unsubscribed: suppressed.length,
    simulated: count("email.simulated"),
    executions,
    chart,
    jobs,
    demo: DEMO,
  };
}
async function segments() {
  const [items, contacts, suppressed] = await Promise.all([
    db.segment.findMany({
      where: { storeId: STORE_ID },
      orderBy: { updatedAt: "desc" },
    }),
    db.contact.findMany({ where: { storeId: STORE_ID } }),
    db.suppression.findMany({ where: { storeId: STORE_ID } }),
  ]);
  return items.map((s) => ({
    ...s,
    rules: JSON.parse(s.rulesJson),
    count: contacts.filter(
      (c) =>
        eligibility(
          c,
          suppressed.some((su) => su.email === c.email),
        ).allowed && matchesRules(c, JSON.parse(s.rulesJson)),
    ).length,
  }));
}
async function route(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const [group, id, action] = path;
  const method = req.method;
  const url = new URL(req.url);
  if (
    group === "webhooks" &&
    method === "POST" &&
    ["shopify", "resend"].includes(id)
  )
    return ok(await receiveWebhook(id as "shopify" | "resend", req), 202);
  assertOrigin(req);
  if (group === "auth" && id === "login" && method === "POST") {
    const key = "single-admin";
    const entry = loginAttempts.get(key);
    if (entry && Date.now() - entry.since < 60000 && entry.count >= 5)
      throw new HttpError(429, "尝试次数过多，请一分钟后重试");
    const { password } = z
      .object({ password: z.string().max(500) })
      .parse(await body(req));
    if (
      !process.env.ADMIN_PASSWORD ||
      !process.env.SESSION_SECRET ||
      !safeEqual(password, process.env.ADMIN_PASSWORD)
    ) {
      loginAttempts.set(key, {
        count: entry && Date.now() - entry.since < 60000 ? entry.count + 1 : 1,
        since:
          entry && Date.now() - entry.since < 60000 ? entry.since : Date.now(),
      });
      throw new HttpError(401, "密码无效或服务端账号未配置");
    }
    loginAttempts.delete(key);
    const r = ok({ authenticated: true });
    r.cookies.set("edm_session", sessionToken(), {
      httpOnly: true,
      secure: appOrigin().startsWith("https://"),
      sameSite: "strict",
      maxAge: 8 * 3600,
      path: "/",
    });
    return r;
  }
  if (!authenticated(req)) throw new HttpError(401, "请登录运营账号");
  if (group === "auth" && id === "logout") {
    const r = ok({});
    r.cookies.delete("edm_session");
    return r;
  }
  if (group === "bootstrap" && method === "GET") {
    const [
      store,
      stats,
      gates,
      workflows,
      templates,
      segmentList,
      campaigns,
      recentEvents,
      receipts,
    ] = await Promise.all([
      db.store.findUnique({ where: { id: STORE_ID } }),
      metrics(),
      liveGateErrors(),
      db.workflow.findMany({
        where: { storeId: STORE_ID },
        orderBy: { updatedAt: "desc" },
      }),
      db.emailTemplate.findMany({
        where: { storeId: STORE_ID },
        orderBy: { updatedAt: "desc" },
      }),
      segments(),
      db.campaign.findMany({
        where: { storeId: STORE_ID },
        orderBy: { createdAt: "desc" },
      }),
      db.emailEvent.findMany({
        where: { storeId: STORE_ID },
        orderBy: { occurredAt: "desc" },
        take: 6,
      }),
      db.webhookReceipt.findMany({
        where: { storeId: STORE_ID },
        orderBy: { createdAt: "desc" },
        take: 2,
      }),
    ]);
    if (!store)
      throw new HttpError(503, "数据库尚未初始化，请运行 npm run setup");
    return ok({
      store,
      metrics: stats,
      gates,
      workflows,
      templates,
      segments: segmentList,
      campaigns,
      recentEvents,
      receipts,
      mode: {
        demo: DEMO,
        dryRun: DRY_RUN,
        localSession: demoLocal(req),
        provider: provider.name,
      },
      defaultContent,
    });
  }
  if (group === "metrics" && id === "overview") return ok(await metrics());
  if (group === "contacts") {
    if (!id && method === "GET") {
      const search = (url.searchParams.get("q") || "").slice(0, 200);
      const state = url.searchParams.get("state");
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const where = {
        storeId: STORE_ID,
        ...(search
          ? {
              OR: [
                { email: { contains: search } },
                { firstName: { contains: search } },
                { lastName: { contains: search } },
              ],
            }
          : {}),
        ...(state ? { marketingState: state } : {}),
      };
      const [items, total] = await Promise.all([
        db.contact.findMany({
          where,
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * 20,
          take: 20,
        }),
        db.contact.count({ where }),
      ]);
      return ok({ items, total, page, pages: Math.ceil(total / 20) });
    }
    const contact = await db.contact.findFirstOrThrow({ where: resource(id) });
    if (method === "GET") {
      const [history, events, orders, segmentList, suppression] =
        await Promise.all([
          db.consentHistory.findMany({
            where: { storeId: STORE_ID, contactId: id },
            orderBy: { occurredAt: "desc" },
          }),
          db.emailEvent.findMany({
            where: { storeId: STORE_ID, contactId: id },
            orderBy: { occurredAt: "desc" },
            take: 25,
          }),
          db.orderSummary.findMany({
            where: { storeId: STORE_ID, contactId: id },
          }),
          segments(),
          db.suppression.findUnique({
            where: {
              storeId_email: { storeId: STORE_ID, email: contact.email },
            },
          }),
        ]);
      return ok({
        ...contact,
        history,
        events,
        orders,
        suppression,
        segments: segmentList.filter(
          (s) =>
            eligibility(contact, !!suppression).allowed &&
            matchesRules(contact, s.rules),
        ),
      });
    }
    if (method === "PATCH") {
      const input = z
        .object({
          paused: z.boolean().optional(),
          notes: z.string().max(2000).optional(),
        })
        .strict()
        .parse(await body(req));
      const updated = await db.contact.update({ where: { id }, data: input });
      await audit("contact.updated", "更新营销暂停状态或内部备注", id);
      return ok(updated);
    }
    if (method === "POST" && action === "unsubscribe") {
      await db.$transaction((tx) =>
        suppress(tx, contact.email, "运营手动退订", "operator", randomUUID()),
      );
      await audit(
        "contact.unsubscribed",
        "本地立即阻断，远端通过 outbox 同步",
        id,
      );
      return ok({ success: true });
    }
    if (method === "DELETE") {
      if (!DEMO)
        throw new HttpError(
          409,
          "真实客户删除必须先完成 Shopify/Resend 删除流程；请按数据删除操作手册处理",
        );
      await db.$transaction(async (tx) => {
        await suppress(
          tx,
          contact.email,
          "DEMO 数据删除",
          "operator",
          randomUUID(),
        );
        await tx.consentHistory.deleteMany({
          where: { storeId: STORE_ID, contactId: id },
        });
        await tx.orderSummary.deleteMany({
          where: { storeId: STORE_ID, contactId: id },
        });
        await tx.emailEvent.deleteMany({
          where: { storeId: STORE_ID, contactId: id },
        });
        await tx.workflowExecution.deleteMany({
          where: { storeId: STORE_ID, contactId: id },
        });
        await tx.contact.delete({ where: { id } });
      });
      await audit(
        "contact.deleted",
        "已删除 DEMO 客户数据；保留拒发记录避免重新导入",
        id,
      );
      return ok({ success: true });
    }
  }
  if (group === "segments") {
    if (!id && method === "GET") return ok(await segments());
    if (method === "POST" || method === "PATCH") {
      const input = z
        .object({
          name: z.string().min(1).max(100),
          description: z.string().max(300).default(""),
          rules: rulesSchema,
        })
        .parse(await body(req));
      const data = {
        name: input.name,
        description: input.description,
        rulesJson: JSON.stringify(input.rules),
      };
      if (id) await db.segment.findFirstOrThrow({ where: resource(id) });
      const s = id
        ? await db.segment.update({ where: { id }, data })
        : await db.segment.create({ data: { ...data, storeId: STORE_ID } });
      await audit("segment.saved", s.name, s.id);
      return ok(s);
    }
    if (method === "DELETE") {
      await db.segment.findFirstOrThrow({ where: resource(id) });
      if (
        await db.campaign.count({ where: { storeId: STORE_ID, segmentId: id } })
      )
        throw new HttpError(409, "分群被活动引用，暂不能删除");
      return ok(await db.segment.delete({ where: { id } }));
    }
  }
  if (group === "templates") {
    if (!id && method === "GET")
      return ok(
        await db.emailTemplate.findMany({ where: { storeId: STORE_ID } }),
      );
    if (id === "preview" && method === "POST") {
      const input = contentSchema.parse(await body(req));
      return ok(await renderEmail(input));
    }
    if (id) await db.emailTemplate.findFirstOrThrow({ where: resource(id) });
    if (method === "POST" && action === "publish") {
      const t = await db.emailTemplate.findUniqueOrThrow({ where: { id } });
      const rendered = await renderEmail(JSON.parse(t.schemaJson));
      const result = await db.emailTemplate.update({
        where: { id },
        data: {
          ...rendered,
          publishedAt: new Date(),
          resendTemplateId: DRY_RUN ? `demo_${id}_v${t.version}` : null,
        },
      });
      await audit(
        "template.published",
        DRY_RUN
          ? "本地模板已发布（模拟用途）"
          : "本地模板已发布；远端发布需完成上线验收",
        id,
      );
      return ok(result);
    }
    if (method === "POST" && action === "test") {
      const { email } = z.object({ email: z.email() }).parse(await body(req));
      const target = normalizeEmail(email);
      const allowed = (process.env.TEST_EMAIL_ALLOWLIST || "")
        .split(",")
        .map(normalizeEmail);
      if (
        !allowed.includes(target) &&
        !(DEMO && target.endsWith("@example.com"))
      )
        throw new HttpError(403, "测试地址不在服务端受控邮箱白名单内");
      if (!DRY_RUN)
        throw new HttpError(
          409,
          "真实测试发送尚未开放；请先完成政策、退订和账号能力 Spike",
        );
      const t = await db.emailTemplate.findUniqueOrThrow({ where: { id } });
      const rendered = await renderEmail(JSON.parse(t.schemaJson));
      await audit(
        "template.test_simulated",
        `DEMO 测试渲染至 ${target}；未投递`,
        id,
      );
      return ok({
        demo: true,
        message: "已完成模拟测试；没有向邮箱投递邮件",
        ...rendered,
      });
    }
    if (method === "POST" || method === "PATCH") {
      const input = z
        .object({
          name: z.string().min(1).max(100),
          category: z.enum([
            "Welcome",
            "Post-purchase",
            "Checkout Reminder",
            "Newsletter",
          ]),
          subject: z.string().min(1).max(200),
          content: contentSchema,
        })
        .parse(await body(req));
      const rendered = await renderEmail(input.content);
      const data = {
        name: input.name,
        category: input.category,
        subject: input.subject,
        schemaJson: JSON.stringify(input.content),
        ...rendered,
        publishedAt: null,
        resendTemplateId: null,
      };
      const t = id
        ? await db.emailTemplate.update({
            where: { id },
            data: { ...data, version: { increment: 1 } },
          })
        : await db.emailTemplate.create({
            data: { ...data, storeId: STORE_ID },
          });
      await audit("template.saved", t.name, t.id);
      return ok(t);
    }
    if (method === "DELETE") {
      const workflows = await db.workflow.findMany({
        where: { storeId: STORE_ID },
      });
      if (
        workflows.some(
          (w) => w.draftJson.includes(id) || w.publishedJson?.includes(id),
        ) ||
        (await db.campaign.count({
          where: { storeId: STORE_ID, templateId: id },
        }))
      )
        throw new HttpError(409, "模板被流程或活动引用，暂不能删除");
      return ok(await db.emailTemplate.delete({ where: { id } }));
    }
  }
  if (group === "workflows") {
    if (!id && method === "GET")
      return ok(await db.workflow.findMany({ where: { storeId: STORE_ID } }));
    if (!id && method === "POST") {
      const input = z
        .object({
          name: z.string().min(1).max(100),
          kind: z
            .enum(["welcome", "post-purchase", "abandoned"])
            .default("welcome"),
          definition: workflowSchema,
        })
        .parse(await body(req));
      return ok(
        await db.workflow.create({
          data: {
            storeId: STORE_ID,
            name: input.name,
            kind: input.kind,
            draftJson: JSON.stringify(input.definition),
          },
        }),
      );
    }
    const w = await db.workflow.findFirstOrThrow({ where: resource(id) });
    if (method === "GET")
      return ok({
        ...w,
        executions: await db.workflowExecution.findMany({
          where: { storeId: STORE_ID, workflowId: id },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
      });
    if (method === "PATCH") {
      const input = z
        .object({
          name: z.string().min(1).max(100),
          definition: workflowSchema,
        })
        .parse(await body(req));
      const result = await db.workflow.update({
        where: { id },
        data: { name: input.name, draftJson: JSON.stringify(input.definition) },
      });
      await audit("workflow.draft_saved", input.name, id);
      return ok(result);
    }
    if (method === "POST" && action === "validate") {
      const templates = await db.emailTemplate.findMany({
        where: { storeId: STORE_ID },
      });
      const d = JSON.parse(w.draftJson);
      const check = validateWorkflow(d, templates);
      let compiled = null;
      let compileMessage = "";
      if (check.valid) {
        try {
          compiled = compileWorkflow(d, templates);
        } catch (e) {
          compileMessage = (e as Error).message;
        }
      }
      return ok({
        ...check,
        compiled,
        compileMessage,
        gates: await liveGateErrors(),
      });
    }
    if (method === "POST" && action === "simulate") {
      const input = z
        .object({
          contactId: z.string(),
          eventKey: z.string().min(1).max(120).optional(),
          purchaseDuringDelay: z.boolean().optional(),
          unsubscribeDuringDelay: z.boolean().optional(),
          eventReceived: z.boolean().optional(),
        })
        .parse(await body(req));
      return ok(
        await executeWorkflow(
          id,
          input.contactId,
          input.eventKey || `manual:${randomUUID()}`,
          {
            purchaseDuringDelay: !!input.purchaseDuringDelay,
            unsubscribeDuringDelay: !!input.unsubscribeDuringDelay,
            eventReceived: !!input.eventReceived,
          },
        ),
      );
    }
    if (method === "POST" && action === "publish") {
      const templates = await db.emailTemplate.findMany({
        where: { storeId: STORE_ID },
      });
      const d: Definition = JSON.parse(w.draftJson);
      const check = validateWorkflow(d, templates);
      if (!check.valid) throw new HttpError(422, check.errors.join("；"));
      if (w.kind === "abandoned")
        throw new HttpError(
          409,
          "弃单流程尚未通过付款退出集成测试，仅开放模拟",
        );
      if (!DRY_RUN) {
        const gates = await liveGateErrors();
        throw new HttpError(
          409,
          gates.length
            ? gates.join("；")
            : "真实发布需完成账号级退出验证及版本切换验收，当前版本未开放",
        );
      }
      const result = await db.workflow.update({
        where: { id },
        data: {
          publishedJson: w.draftJson,
          compiledJson: d.nodes.every((n) =>
            ["trigger", "send_email", "end"].includes(n.type),
          )
            ? JSON.stringify(compileWorkflow(d, templates))
            : null,
          status: "demo_published",
          version: { increment: 1 },
          lastDeployedAt: new Date(),
          lastError: null,
        },
      });
      await audit(
        "workflow.demo_published",
        "已保存模拟发布快照；未创建真实自动化",
        id,
      );
      return ok(result);
    }
    if (method === "POST" && action === "pause") {
      await db.workflow.update({ where: { id }, data: { status: "paused" } });
      if (w.resendAutomationId && !w.resendAutomationId.startsWith("demo_"))
        await new ResendProvider().stopAutomation(w.resendAutomationId);
      await audit(
        "workflow.paused",
        "停止新事件进入；已在远端运行的任务需单独核实退出状态",
        id,
      );
      return ok({ status: "paused" });
    }
    if (method === "DELETE") {
      if (w.status === "demo_published" || w.resendAutomationId)
        throw new HttpError(409, "请先暂停工作流");
      await db.workflowExecution.deleteMany({
        where: { storeId: STORE_ID, workflowId: id },
      });
      return ok(await db.workflow.delete({ where: { id } }));
    }
  }
  if (group === "campaigns") {
    if (!id && method === "GET")
      return ok(await db.campaign.findMany({ where: { storeId: STORE_ID } }));
    if (!id && method === "POST") {
      const input = z
        .object({
          name: z.string().min(1).max(100),
          templateId: z.string(),
          segmentId: z.string(),
        })
        .parse(await body(req));
      await db.emailTemplate.findFirstOrThrow({
        where: resource(input.templateId),
      });
      await db.segment.findFirstOrThrow({ where: resource(input.segmentId) });
      return ok(
        await db.campaign.create({ data: { ...input, storeId: STORE_ID } }),
      );
    }
    const campaign = await db.campaign.findFirstOrThrow({
      where: resource(id),
    });
    if (method === "POST" && action === "simulate") {
      if (campaign.status === "simulated")
        return ok({ ...campaign, duplicate: true });
      const t = await db.emailTemplate.findFirstOrThrow({
        where: resource(campaign.templateId),
      });
      if (!t.publishedAt) throw new HttpError(422, "请先发布活动模板");
      const s = await db.segment.findFirstOrThrow({
        where: resource(campaign.segmentId),
      });
      const result = await db.$transaction(async (tx) => {
        const claim = await tx.campaign.updateMany({
          where: { id, status: "draft" },
          data: { status: "processing" },
        });
        if (!claim.count) throw new HttpError(409, "活动已处理");
        const contacts = await tx.contact.findMany({
          where: { storeId: STORE_ID },
        });
        const suppressed = await tx.suppression.findMany({
          where: { storeId: STORE_ID },
        });
        const recent = await tx.emailEvent.findMany({
          where: {
            storeId: STORE_ID,
            eventType: "email.simulated",
            occurredAt: { gte: new Date(Date.now() - 86400000) },
          },
          select: { contactId: true },
        });
        const recentContacts = new Set(recent.map((event) => event.contactId));
        const suppressedEmails = new Set(suppressed.map((entry) => entry.email));
        const recipients = [];
        const rules = JSON.parse(s.rulesJson);
        let frequencyBlocked = 0;
        for (const c of contacts) {
          if (
            !eligibility(c, suppressedEmails.has(c.email)).allowed ||
            !matchesRules(c, rules)
          )
            continue;
          if (recentContacts.has(c.id)) {
            frequencyBlocked++;
            continue;
          }
          recipients.push(c);
        }
        if (recipients.length)
          await tx.emailEvent.createMany({
            data: recipients.map((c) => ({
              storeId: STORE_ID,
              providerEventId: `campaign:${id}:${c.id}`,
              contactId: c.id,
              eventType: "email.simulated",
              demo: true,
              metadataJson: JSON.stringify({
                campaignId: id,
                templateId: t.id,
              }),
            })),
          });
        const updated = await tx.campaign.update({
          where: { id },
          data: {
            status: "simulated",
            recipientCount: recipients.length,
            sentAt: new Date(),
          },
        });
        return { ...updated, frequencyBlocked };
      });
      await audit(
        "campaign.simulated",
        `模拟发送决策 ${result.recipientCount} 人；频率限制 ${result.frequencyBlocked} 人`,
        id,
      );
      return ok(result);
    }
    if (method === "POST" && action === "send")
      throw new HttpError(
        409,
        (await liveGateErrors()).join("；") ||
          "真实群发尚未通过服务商与账号集成验收",
      );
  }
  if (group === "events" && method === "GET") {
    const type = url.searchParams.get("type");
    return ok({
      events: await db.emailEvent.findMany({
        where: { storeId: STORE_ID, ...(type ? { eventType: type } : {}) },
        orderBy: { occurredAt: "desc" },
        take: 100,
      }),
      audit: await db.auditLog.findMany({
        where: { storeId: STORE_ID },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      jobs: await db.outboxJob.findMany({
        where: { storeId: STORE_ID },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          kind: true,
          status: true,
          attempts: true,
          nextRunAt: true,
          lastError: true,
          createdAt: true,
        },
      }),
    });
  }
  if (group === "jobs" && id === "run" && method === "POST")
    return ok(await runJobs());
  if (group === "jobs" && action === "retry" && method === "POST") {
    const job = await db.outboxJob.findFirstOrThrow({ where: resource(id) });
    if (!["dead", "pending"].includes(job.status))
      throw new HttpError(409, "该任务不可重试");
    await audit("job.retry", "运营重新排队", id);
    return ok(
      await db.outboxJob.update({
        where: { id },
        data: {
          status: "pending",
          attempts: 0,
          nextRunAt: new Date(),
          lastError: null,
        },
      }),
    );
  }
  if (group === "settings" && method === "PATCH") {
    const input = z
      .object({
        name: z.string().min(1).max(100).optional(),
        liveEnabled: z.boolean().optional(),
      })
      .strict()
      .parse(await body(req));
    if (input.liveEnabled)
      throw new HttpError(
        409,
        "当前版本为验收预览；完成真实集成验证前不开放真实发送开关",
      );
    const store = await db.store.update({
      where: { id: STORE_ID },
      data: input,
    });
    await audit("settings.updated", "更新工作台设置");
    return ok(store);
  }
  if (group === "integrations" && id === "shopify" && method === "POST") {
    if (action === "sync") {
      const job = await queue(
        "shopify_sync",
        {},
        `sync:${STORE_ID}:${Math.floor(Date.now() / 60000)}`,
      );
      return ok(
        {
          jobId: job.id,
          status: job.status,
          message: "同步已排队；独立 worker 将处理任务",
        },
        202,
      );
    }
    if (action === "connect") {
      if (DEMO)
        return ok({
          connected: false,
          demo: true,
          message: "DEMO 模式不连接真实店铺；请按 README 配置独立真实环境",
        });
      const result = await graphql(
        "query StudioConnection { shop { name myshopifyDomain currencyCode } }",
      );
      const store = await db.store.update({
        where: { id: STORE_ID },
        data: {
          shopDomain: shopDomain(),
          name: result.shop.name,
          currency: result.shop.currencyCode,
          connectStatus: "connected",
          tokenReference: "env:SHOPIFY_ACCESS_TOKEN",
        },
      });
      await audit("shopify.connected", "服务端现有访问令牌已验证");
      return ok({ store });
    }
  }
  if (
    group === "integrations" &&
    id === "resend" &&
    action === "verify" &&
    method === "POST"
  ) {
    if (DEMO)
      return ok({
        verified: false,
        message: "DEMO 模式未访问 Resend；域名保持未验证",
      });
    const from = process.env.RESEND_FROM || "";
    const domain = from.match(/@([^>\s]+)/)?.[1];
    if (!domain) throw new HttpError(422, "请配置 RESEND_FROM");
    const result = await new ResendProvider().request("/domains");
    const domains = result.data as { name: string; status: string }[];
    const verified = domains.some(
      (d) => d.name === domain && d.status === "verified",
    );
    await db.store.update({
      where: { id: STORE_ID },
      data: { domainVerified: verified, domainCheckedAt: new Date() },
    });
    return ok({ verified });
  }
  throw new HttpError(404, "接口不存在");
}
async function handler(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await route(req, context);
  } catch (e: any) {
    if (e instanceof HttpError) return ok({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return ok(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("；"),
        },
        422,
      );
    if (e.code === "P2025") return ok({ error: "记录不存在" }, 404);
    if (e.code === "P2002") return ok({ error: "记录已存在，请刷新重试" }, 409);
    console.error("API error:", e instanceof Error ? e.message : "unknown");
    return ok({ error: "操作失败，请检查事件日志和服务端配置后重试" }, 500);
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
