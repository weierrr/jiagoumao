import test from "node:test";
import assert from "node:assert/strict";
import {
  eligibility,
  matchesRules,
  validateWorkflow,
  compileWorkflow,
  simulate,
  workflowSchema,
} from "../src/lib/domain";
import { preset } from "../prisma/seed";
import { defaultContent, renderEmail, contentSchema } from "../src/lib/email";
import { verifyShopify, verifyResend } from "../src/lib/webhooks";
import { createHmac } from "node:crypto";
import { Webhook } from "svix";
import {
  MockProvider,
  ResendProvider,
  ProviderError,
} from "../src/lib/providers";
const contact = {
  email: "alex@example.com",
  marketingState: "SUBSCRIBED",
  ordersCount: 0,
  totalSpent: 0,
  paused: false,
};
const templates = [
  {
    id: "tpl-welcome",
    publishedAt: new Date(),
    resendTemplateId: "verified-template",
  },
  { id: "tpl-care", publishedAt: new Date() },
  { id: "tpl-checkout", publishedAt: new Date() },
];
test("only active SUBSCRIBED contacts are eligible, every deny flag takes precedence", () => {
  assert.equal(eligibility(contact).allowed, true);
  for (const state of [
    "PENDING",
    "UNSUBSCRIBED",
    "NOT_SUBSCRIBED",
    "REDACTED",
    "INVALID",
  ])
    assert.equal(
      eligibility({ ...contact, marketingState: state }).allowed,
      false,
    );
  assert.equal(eligibility(contact, true).allowed, false);
  assert.equal(eligibility({ ...contact, paused: true }).allowed, false);
  assert.equal(
    eligibility({ ...contact, suppressedAt: new Date() }).allowed,
    false,
  );
});
test("segment AND, OR, numeric, tags, and missing order-date behavior", () => {
  assert.equal(
    matchesRules(contact, {
      mode: "AND",
      rules: [
        { field: "ordersCount", op: "eq", value: 0 },
        { field: "totalSpent", op: "gte", value: 1 },
      ],
    }),
    false,
  );
  assert.equal(
    matchesRules(contact, {
      mode: "OR",
      rules: [
        { field: "ordersCount", op: "eq", value: 0 },
        { field: "totalSpent", op: "gte", value: 1 },
      ],
    }),
    true,
  );
  assert.equal(
    matchesRules(
      { ...contact, tags: '["VIP"]' },
      { mode: "AND", rules: [{ field: "tag", op: "contains", value: "VIP" }] },
    ),
    true,
  );
  assert.equal(
    matchesRules(contact, {
      mode: "AND",
      rules: [{ field: "daysSinceOrder", op: "gte", value: 30 }],
    }),
    false,
  );
});
test("welcome compiler uses REST event_name and drops terminal nodes", () => {
  const d = preset("welcome");
  assert.equal(validateWorkflow(d, templates).valid, true);
  const result = compileWorkflow(d, templates);
  assert.equal(result.steps.length, 2);
  assert.equal(
    result.steps[0].config.event_name,
    "shopify.customer.subscribed",
  );
  assert.deepEqual(result.connections, [{ from: "trigger", to: "send" }]);
  assert.equal(result.steps[1].config.template?.id, "verified-template");
});
test("invalid workflow graph rejects duplicate IDs, cycles, disconnected nodes, and multiple triggers", () => {
  for (const mutate of [
    (d: any) => d.nodes.push({ ...d.nodes[0] }),
    (d: any) =>
      d.edges.push({ id: "cycle", source: "send", target: "trigger" }),
    (d: any) =>
      d.nodes.push({
        id: "lonely",
        type: "end",
        position: { x: 0, y: 0 },
        data: { label: "lonely" },
      }),
    (d: any) => d.nodes.push({ ...d.nodes[0], id: "trigger2" }),
  ]) {
    const d = preset("welcome");
    mutate(d);
    assert.equal(validateWorkflow(d, templates).valid, false);
  }
});
test("unpublished templates and dangling edges are blocked", () => {
  assert.equal(validateWorkflow(preset("welcome"), []).valid, false);
  const d = preset("welcome");
  d.edges[0].target = "missing";
  assert.equal(validateWorkflow(d, templates).valid, false);
});
test("delay limited to 30 days and complex REST compilation never pretends support", () => {
  const d = preset("post-purchase");
  assert.equal(validateWorkflow(d, templates).valid, true);
  assert.throws(() => compileWorkflow(d, templates), /仅支持本地模拟/);
  d.nodes[1].data.duration = 2592001;
  assert.equal(workflowSchema.safeParse(d).success, false);
});
test("condition branches must explicitly have true and false exits", () => {
  const d = preset("post-purchase");
  d.edges.find((e) => e.sourceHandle === "false")!.sourceHandle = "true";
  assert.equal(validateWorkflow(d, templates).valid, false);
});
test("unsubscribe during simulated delay prevents follow-up send", () => {
  const d = preset("post-purchase");
  const normal = simulate(d, contact);
  assert.equal(normal.filter((t) => t.status === "simulated").length, 1);
  const cancelled = simulate(d, contact, { unsubscribeDuringDelay: true });
  assert.equal(cancelled.filter((t) => t.status === "simulated").length, 0);
});
test("purchase during simulated abandoned checkout wait prevents reminder", () => {
  const d = preset("abandoned");
  assert.equal(
    simulate(d, contact, { purchaseDuringDelay: true }).filter(
      (t) => t.status === "simulated",
    ).length,
    0,
  );
  assert.equal(
    simulate(d, contact).filter((t) => t.status === "simulated").length,
    1,
  );
});
test("wait-for-event simulation takes explicit event and timeout branches", () => {
  const d = preset("post-purchase");
  const n = d.nodes.find((n) => n.id === "condition")!;
  n.type = "wait_for_event";
  n.data = { label: "Wait", eventName: "shopify.order.paid", duration: 120 };
  d.edges.find((e) => e.sourceHandle === "true")!.sourceHandle = "event";
  d.edges.find((e) => e.sourceHandle === "false")!.sourceHandle = "timeout";
  assert.equal(validateWorkflow(d, templates).valid, true);
  assert.equal(
    simulate(d, contact, { eventReceived: true }).filter(
      (t) => t.status === "simulated",
    ).length,
    1,
  );
  assert.equal(
    simulate(d, contact, { eventReceived: false }).filter(
      (t) => t.status === "simulated",
    ).length,
    0,
  );
});
test("template safely escapes variables and rejects executable URL schemes", async () => {
  const result = await renderEmail(
    { ...defaultContent, body: "Hello {{ first_name }}" },
    { first_name: "<script>alert(1)</script>" },
  );
  assert.ok(!result.html.includes("<script>"));
  assert.ok(result.html.includes("&lt;script&gt;"));
  assert.ok(result.html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"));
  assert.ok(result.text.includes("Unsubscribe"));
  assert.equal(
    contentSchema.safeParse({
      ...defaultContent,
      buttonUrl: "javascript:alert(1)",
    }).success,
    false,
  );
});
test("Shopify HMAC is raw-body sensitive; invalid and missing signatures fail", () => {
  const raw = '{"a":1}';
  const secret = "test";
  const sig = createHmac("sha256", secret).update(raw).digest("base64");
  assert.equal(verifyShopify(raw, sig, secret), true);
  assert.equal(verifyShopify(raw + " ", sig, secret), false);
  assert.equal(verifyShopify(raw, null, secret), false);
});
test("Resend Svix signature and timestamp checks reject tampering and replay", () => {
  const secret = process.env.RESEND_WEBHOOK_SECRET!;
  const wh = new Webhook(secret);
  const raw = JSON.stringify({ type: "email.delivered", data: {} });
  const now = new Date();
  const headers = {
    "svix-id": "msg_test",
    "svix-timestamp": String(Math.floor(+now / 1000)),
    "svix-signature": wh.sign("msg_test", now, raw),
  };
  assert.equal(verifyResend(raw, headers, secret).type, "email.delivered");
  assert.throws(() => verifyResend(raw + " ", headers, secret));
  assert.throws(() =>
    verifyResend(raw, { ...headers, "svix-timestamp": "1" }, secret),
  );
});
test("MockProvider deterministically deduplicates without invoking fetch", async () => {
  const p = new MockProvider();
  assert.deepEqual(
    await p.sendBusinessEvent({}, "stable-key"),
    await p.sendBusinessEvent({}, "stable-key"),
  );
});
test("Resend adapter forwards rate limits without retrying a request internally", async () => {
  const old = global.fetch;
  const key = process.env.RESEND_API_KEY;
  let calls = 0;
  process.env.RESEND_API_KEY = "test";
  global.fetch = async () => {
    calls++;
    return new Response("{}", {
      status: 429,
      headers: { "retry-after": "17" },
    });
  };
  try {
    await assert.rejects(
      new ResendProvider().request("/contacts", "POST", {}, "stable-key"),
      (e: any) =>
        e instanceof ProviderError && e.status === 429 && e.retryAfter === 17,
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = old;
    process.env.RESEND_API_KEY = key;
  }
});
