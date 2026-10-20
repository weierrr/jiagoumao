import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { Webhook } from "svix";
import { db, STORE_ID } from "../src/lib/db";
import { seed } from "../prisma/seed";
import { importCustomer } from "../src/lib/shopify";
import { receiveWebhook } from "../src/lib/webhooks";
import { executeWorkflow, queue, runJobs } from "../src/lib/jobs";
import { GET, POST, PATCH } from "../src/app/api/[...path]/route";
async function call(
  path: string,
  method = "GET",
  body?: any,
  headers: Record<string, string> = {},
) {
  const req = new Request(`http://127.0.0.1:3100/api/${path}`, {
    method,
    headers: { host: "127.0.0.1:3100", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (method === "GET" ? GET : method === "PATCH" ? PATCH : POST)(req, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
}
function shopRequest(
  payload: any,
  id: string,
  topic: string,
  overrides: Record<string, string> = {},
) {
  const raw = JSON.stringify(payload);
  return new Request("http://localhost/api/webhooks/shopify", {
    method: "POST",
    body: raw,
    headers: {
      "x-shopify-hmac-sha256": createHmac(
        "sha256",
        process.env.SHOPIFY_WEBHOOK_SECRET!,
      )
        .update(raw)
        .digest("base64"),
      "x-shopify-shop-domain": "test.myshopify.com",
      "x-shopify-webhook-id": id,
      "x-shopify-topic": topic,
      ...overrides,
    },
  });
}
function resendRequest(payload: any, id: string) {
  const raw = JSON.stringify(payload);
  const now = new Date();
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    body: raw,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(+now / 1000)),
      "svix-signature": new Webhook(process.env.RESEND_WEBHOOK_SECRET!).sign(
        id,
        now,
        raw,
      ),
    },
  });
}
before(async () => {
  await seed();
});
after(async () => {
  await db.$disconnect();
});
test("seed is repeatable and does not reset contact edits", async () => {
  const count = await db.contact.count();
  await db.contact.update({
    where: { id: "contact-2" },
    data: { notes: "persist me" },
  });
  await seed();
  assert.equal(await db.contact.count(), count);
  assert.equal(
    (await db.contact.findUniqueOrThrow({ where: { id: "contact-2" } })).notes,
    "persist me",
  );
});
test("management requests are guarded outside loopback; foreign origins rejected", async () => {
  assert.equal((await call("bootstrap")).status, 200);
  assert.equal(
    (await call("bootstrap", "GET", undefined, { host: "public.example.com" }))
      .status,
    401,
  );
  assert.equal(
    (
      await call(
        "settings",
        "PATCH",
        { name: "attack" },
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("settings", "PATCH", { liveEnabled: true })).status,
    409,
  );
});
test("arbitrary contact subscription promotion is rejected", async () => {
  assert.equal(
    (
      await call("contacts/contact-6", "PATCH", {
        marketingState: "SUBSCRIBED",
      })
    ).status,
    422,
  );
});
test("search and segment count honor suppression even under OR rules", async () => {
  const search = await (await call("contacts?q=alex")).json();
  assert.equal(search.items.length, 1);
  const created = await (
    await call("segments", "POST", {
      name: "Test OR",
      rules: {
        mode: "OR",
        rules: [
          { field: "marketingState", op: "eq", value: "UNSUBSCRIBED" },
          { field: "ordersCount", op: "gte", value: 0 },
        ],
      },
    })
  ).json();
  const rows = await (await call("segments")).json();
  const s = rows.find((s: any) => s.id === created.id);
  assert.equal(s.count, 14);
});
test("workflow draft positions persist and published snapshot stays stable", async () => {
  const w = await db.workflow.findUniqueOrThrow({
    where: { id: "wf-welcome" },
  });
  const definition = JSON.parse(w.draftJson);
  definition.nodes[0].position = { x: 333, y: 222 };
  await call("workflows/wf-welcome", "PATCH", { name: w.name, definition });
  await call("workflows/wf-welcome/publish", "POST", {});
  definition.nodes[0].position.x = 444;
  await call("workflows/wf-welcome", "PATCH", { name: w.name, definition });
  const saved = await (await call("workflows/wf-welcome")).json();
  assert.equal(JSON.parse(saved.draftJson).nodes[0].position.x, 444);
  assert.equal(JSON.parse(saved.publishedJson).nodes[0].position.x, 333);
});
test("duplicate business event creates exactly one execution and one send decision", async () => {
  const a = await executeWorkflow("wf-welcome", "contact-1", "unique-event");
  const b = await executeWorkflow("wf-welcome", "contact-1", "unique-event");
  assert.equal(a.id, b.id);
  assert.equal(b.duplicate, true);
  assert.equal(
    await db.emailEvent.count({
      where: { providerEventId: { startsWith: `simulation:${a.id}:` } },
    }),
    1,
  );
});
test("frequency limit blocks a second event for the same customer", async () => {
  const r = await executeWorkflow("wf-welcome", "contact-1", "second-event");
  assert.equal(r.status, "blocked");
  assert.ok(r.trace.some((t: any) => t.action.includes("24 小时")));
});
test("Shopify invalid HMAC and wrong shop never persist any receipt", async () => {
  const before = await db.webhookReceipt.count();
  await assert.rejects(
    receiveWebhook(
      "shopify",
      shopRequest({ id: 999 }, "bad", "customers/update", {
        "x-shopify-hmac-sha256": "invalid",
      }),
    ),
  );
  await assert.rejects(
    receiveWebhook(
      "shopify",
      shopRequest({ id: 999 }, "bad-shop", "customers/update", {
        "x-shopify-shop-domain": "other.myshopify.com",
      }),
    ),
  );
  assert.equal(await db.webhookReceipt.count(), before);
});
test("Shopify consent webhook immediately suppresses and triple delivery only queues once", async () => {
  const payload = {
    customer_id: 10002,
    email_marketing_consent: {
      state: "unsubscribed",
      consent_updated_at: new Date().toISOString(),
    },
  };
  for (let i = 0; i < 3; i++)
    await receiveWebhook(
      "shopify",
      shopRequest(
        payload,
        "deny-3",
        "customers_email_marketing_consent/update",
      ),
    );
  const c = await db.contact.findUniqueOrThrow({ where: { id: "contact-3" } });
  assert.equal(c.marketingState, "UNSUBSCRIBED");
  assert.ok(c.suppressedAt);
  assert.equal(
    await db.webhookReceipt.count({ where: { eventId: "deny-3" } }),
    1,
  );
  assert.equal(
    await db.outboxJob.count({
      where: { key: `webhook:${STORE_ID}:shopify:deny-3` },
    }),
    1,
  );
  const r = await executeWorkflow("wf-welcome", "contact-3", "after-deny");
  assert.equal(r.status, "blocked");
});
test("webhook ID reuse with a different payload is rejected", async () => {
  await assert.rejects(
    receiveWebhook(
      "shopify",
      shopRequest(
        { customer_id: 10002, marketing_state: "subscribed" },
        "deny-3",
        "customers_email_marketing_consent/update",
      ),
    ),
    /不一致/,
  );
});
test("out-of-order Shopify subscribed sync cannot undo suppression", async () => {
  await importCustomer(
    {
      id: "gid://shopify/Customer/10002",
      email: "oliver.taylor@example.com",
      emailMarketingConsent: {
        marketingState: "SUBSCRIBED",
        consentUpdatedAt: new Date(Date.now() + 10000).toISOString(),
      },
    },
    "late-subscribe",
  );
  const c = await db.contact.findUniqueOrThrow({ where: { id: "contact-3" } });
  assert.equal(c.marketingState, "UNSUBSCRIBED");
});
test("pending opt-in can legitimately transition to subscribed", async () => {
  const id = "gid://shopify/Customer/99001";
  await importCustomer(
    {
      id,
      email: "pending@example.com",
      updatedAt: new Date().toISOString(),
      emailMarketingConsent: { marketingState: "PENDING" },
    },
    "pending",
  );
  await importCustomer(
    {
      id,
      email: "pending@example.com",
      updatedAt: new Date(Date.now() + 1000).toISOString(),
      emailMarketingConsent: { marketingState: "SUBSCRIBED" },
    },
    "confirmed",
  );
  const c = await db.contact.findUniqueOrThrow({
    where: {
      storeId_email: { storeId: STORE_ID, email: "pending@example.com" },
    },
  });
  assert.equal(c.marketingState, "SUBSCRIBED");
  assert.equal(c.suppressedAt, null);
});
test("signed Resend unsubscribe immediately blocks future sends and deduplicates", async () => {
  const payload = {
    type: "contact.updated",
    created_at: new Date().toISOString(),
    data: { id: "demo_contact_4", unsubscribed: true },
  };
  for (let i = 0; i < 3; i++)
    await receiveWebhook("resend", resendRequest(payload, "svix-unsub"));
  const c = await db.contact.findUniqueOrThrow({ where: { id: "contact-4" } });
  assert.equal(c.marketingState, "UNSUBSCRIBED");
  assert.equal(
    await db.consentHistory.count({
      where: {
        contactId: c.id,
        sourceEventId: "svix-unsub",
        provider: "resend",
      },
    }),
    1,
  );
});
test("unknown negative recipient stops store live switch rather than silently dropping event", async () => {
  await db.store.update({
    where: { id: STORE_ID },
    data: { liveEnabled: true },
  });
  await receiveWebhook(
    "resend",
    resendRequest(
      { type: "suppression.added", data: { email_id: "unmapped" } },
      "svix-unknown",
    ),
  );
  assert.equal(
    (await db.store.findUniqueOrThrow({ where: { id: STORE_ID } })).liveEnabled,
    false,
  );
});
test("worker handles duplicate paid events without double-counting orders and cancels checkout", async () => {
  await db.abandonedCheckout.create({
    data: {
      storeId: STORE_ID,
      shopifyCheckoutGid: "checkout-1",
      contactId: "contact-5",
      reminderStatus: "pending",
    },
  });
  const payload = {
    id: 9001,
    customer: { id: 10004 },
    created_at: new Date().toISOString(),
    financial_status: "paid",
    total_price: "44.50",
    currency: "USD",
  };
  for (let i = 0; i < 3; i++)
    await receiveWebhook(
      "shopify",
      shopRequest(payload, "paid-1", "orders/paid"),
    );
  await runJobs(100);
  assert.equal(
    await db.orderSummary.count({
      where: { shopifyOrderGid: "gid://shopify/Order/9001" },
    }),
    1,
  );
  assert.equal(
    (
      await db.abandonedCheckout.findFirstOrThrow({
        where: { shopifyCheckoutGid: "checkout-1" },
      })
    ).reminderStatus,
    "cancelled",
  );
});
test("durable jobs survive a client disconnect; unknown jobs back off then dead-letter", async () => {
  const job = await queue("unsupported", {}, "retry-test");
  await db.$disconnect();
  await runJobs(100);
  let saved = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(saved.status, "pending");
  assert.ok(+saved.nextRunAt > Date.now());
  for (let i = 0; i < 4; i++) {
    await db.outboxJob.update({
      where: { id: job.id },
      data: { nextRunAt: new Date(0) },
    });
    await runJobs(100);
  }
  saved = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(saved.status, "dead");
  assert.equal(saved.attempts, 5);
});
test("campaign reevaluates recipients, applies frequency protection, and never repeats", async () => {
  const before = await db.emailEvent.count({
    where: { eventType: "email.simulated" },
  });
  const response = await (
    await call("campaigns/campaign-october/simulate", "POST", {})
  ).json();
  assert.ok(response.recipientCount > 0);
  await call("campaigns/campaign-october/simulate", "POST", {});
  assert.equal(
    await db.emailEvent.count({ where: { eventType: "email.simulated" } }),
    before + response.recipientCount,
  );
  assert.equal(
    await db.emailEvent.count({
      where: { contactId: "contact-3", eventType: "email.simulated" },
    }),
    0,
  );
});
test("uncontrolled test email denied, demo example.com explicitly simulated", async () => {
  assert.equal(
    (
      await call("templates/tpl-welcome/test", "POST", {
        email: "someone@gmail.com",
      })
    ).status,
    403,
  );
  const r = await (
    await call("templates/tpl-welcome/test", "POST", {
      email: "owner@example.com",
    })
  ).json();
  assert.equal(r.demo, true);
});
test("abandoned publication and live campaign send remain blocked", async () => {
  assert.equal(
    (await call("workflows/wf-abandoned/publish", "POST", {})).status,
    409,
  );
  assert.equal(
    (await call("campaigns/campaign-october/send", "POST", {})).status,
    409,
  );
});
test("privacy request visible in audit and stops live sending", async () => {
  await receiveWebhook(
    "shopify",
    shopRequest(
      { customer: { id: 10010 } },
      "privacy-1",
      "customers/data_request",
    ),
  );
  await runJobs(100);
  assert.equal(
    await db.auditLog.count({
      where: { action: "privacy.action_required", targetId: "privacy-1" },
    }),
    1,
  );
  assert.equal(
    (await db.store.findUniqueOrThrow({ where: { id: STORE_ID } })).liveEnabled,
    false,
  );
});

test("published welcome executes from a signed subscription event, then pause blocks new entries", async () => {
  await call("workflows/wf-welcome/publish", "POST", {});
  const payload = {
    id: 99501,
    email: "welcome.pipeline@example.com",
    first_name: "Pipeline",
    updated_at: new Date().toISOString(),
    email_marketing_consent: {
      state: "subscribed",
      consent_updated_at: new Date().toISOString(),
    },
  };
  for (let i = 0; i < 3; i++)
    await receiveWebhook(
      "shopify",
      shopRequest(payload, "welcome-pipeline", "customers/create"),
    );
  await runJobs(100);
  const contact = await db.contact.findUniqueOrThrow({
    where: { storeId_email: { storeId: STORE_ID, email: payload.email } },
  });
  assert.equal(
    await db.workflowExecution.count({
      where: {
        contactId: contact.id,
        businessEventKey: "shopify:welcome-pipeline",
      },
    }),
    1,
  );
  assert.equal(
    await db.emailEvent.count({
      where: { contactId: contact.id, eventType: "email.simulated" },
    }),
    1,
  );
  await call("workflows/wf-welcome/pause", "POST", {});
  await receiveWebhook(
    "shopify",
    shopRequest(
      { ...payload, id: 99502, email: "welcome.paused@example.com" },
      "welcome-paused",
      "customers/create",
    ),
  );
  await runJobs(100);
  assert.equal(
    await db.workflowExecution.count({
      where: { businessEventKey: "shopify:welcome-paused" },
    }),
    0,
  );
});

test("published post-purchase demo executes once from a signed paid event", async () => {
  await call("workflows/wf-post-purchase/publish", "POST", {});
  await importCustomer(
    {
      id: "gid://shopify/Customer/99601",
      email: "care.pipeline@example.com",
      emailMarketingConsent: {
        marketingState: "SUBSCRIBED",
        consentUpdatedAt: new Date().toISOString(),
      },
    },
    "care-consent",
  );
  const payload = {
    id: 99602,
    customer: { id: 99601 },
    created_at: new Date().toISOString(),
    financial_status: "paid",
    total_price: "48.35",
    currency: "USD",
  };
  for (let i = 0; i < 3; i++)
    await receiveWebhook(
      "shopify",
      shopRequest(payload, "care-pipeline", "orders/paid"),
    );
  await runJobs(100);
  assert.equal(
    await db.workflowExecution.count({
      where: {
        workflowId: "wf-post-purchase",
        businessEventKey: "shopify:care-pipeline",
      },
    }),
    1,
  );
  assert.equal(
    await db.emailEvent.count({
      where: { workflowId: "wf-post-purchase", eventType: "email.simulated" },
    }),
    1,
  );
});

test("topic opt-out suppresses immediately and signed malformed Shopify JSON is rejected", async () => {
  await receiveWebhook(
    "resend",
    resendRequest(
      {
        type: "contact.topics.updated",
        data: {
          email: "ava.martin@example.com",
          topics: [{ id: "topic-test", subscription: "opt_out" }],
        },
      },
      "topic-optout",
    ),
  );
  assert.ok(
    (await db.contact.findUniqueOrThrow({ where: { id: "contact-6" } }))
      .suppressedAt,
  );
  const raw = "invalid-json";
  const response = await POST(
    new Request("http://127.0.0.1:3100/api/webhooks/shopify", {
      method: "POST",
      body: raw,
      headers: {
        "x-shopify-shop-domain": "test.myshopify.com",
        "x-shopify-hmac-sha256": createHmac(
          "sha256",
          process.env.SHOPIFY_WEBHOOK_SECRET!,
        )
          .update(raw)
          .digest("base64"),
        "x-shopify-webhook-id": "malformed",
        "x-shopify-topic": "customers/update",
      },
    }),
    { params: Promise.resolve({ path: ["webhooks", "shopify"] }) },
  );
  assert.equal(response.status, 400);
  assert.equal(
    await db.webhookReceipt.count({ where: { eventId: "malformed" } }),
    0,
  );
});
