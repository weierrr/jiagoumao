import { createHash } from "node:crypto";
import { db, STORE_ID, DRY_RUN, DEMO } from "./db";
export type Payload = Record<string, unknown>;
export interface EmailProvider {
  readonly name: string;
  upsertContact(p: Payload, key: string): Promise<Payload>;
  updateConsent(
    id: string,
    unsubscribed: boolean,
    key: string,
  ): Promise<Payload>;
  syncSegment(name: string, key: string): Promise<Payload>;
  createTemplate(p: Payload, key: string): Promise<Payload>;
  publishTemplate(id: string): Promise<Payload>;
  createAutomation(p: Payload, key: string): Promise<Payload>;
  stopAutomation(id: string): Promise<Payload>;
  sendBusinessEvent(p: Payload, key: string): Promise<Payload>;
  createBroadcast(p: Payload, key: string): Promise<Payload>;
  sendBroadcast(id: string, key: string): Promise<Payload>;
  getUsage(): Promise<Payload>;
}
export class MockProvider implements EmailProvider {
  readonly name = "mock";
  async result(key: string) {
    return {
      id: `demo_${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
      demo: true,
    };
  }
  upsertContact(p: Payload, key: string) {
    return this.result(key);
  }
  updateConsent(id: string, u: boolean, key: string) {
    return this.result(key);
  }
  syncSegment(n: string, key: string) {
    return this.result(key);
  }
  createTemplate(p: Payload, key: string) {
    return this.result(key);
  }
  publishTemplate(id: string) {
    return this.result(id);
  }
  createAutomation(p: Payload, key: string) {
    return this.result(key);
  }
  stopAutomation(id: string) {
    return this.result(id);
  }
  sendBusinessEvent(p: Payload, key: string) {
    return this.result(key);
  }
  createBroadcast(p: Payload, key: string) {
    return this.result(key);
  }
  sendBroadcast(id: string, key: string) {
    return this.result(key);
  }
  async getUsage() {
    return {
      demo: true,
      verified: false,
      message: "尚未连接账号；不估算真实额度或费用",
    };
  }
}
export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export class ResendProvider implements EmailProvider {
  readonly name = "resend";
  async request(
    path: string,
    method = "GET",
    body?: Payload,
    key?: string,
  ): Promise<Payload> {
    if (!process.env.RESEND_API_KEY) throw new Error("缺少 RESEND_API_KEY");
    const r = await fetch(`https://api.resend.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new ProviderError(
        `Resend ${r.status}：请求未成功`,
        r.status,
        Number(r.headers.get("retry-after") || 0),
      );
    return r.status === 204 ? {} : r.json();
  }
  upsertContact(p: Payload, key: string) {
    return this.request("/contacts", "POST", p, key);
  }
  updateConsent(id: string, unsubscribed: boolean, key: string) {
    return this.request(
      `/contacts/${encodeURIComponent(id)}`,
      "PATCH",
      { unsubscribed },
      key,
    );
  }
  syncSegment(name: string, key: string) {
    return this.request("/segments", "POST", { name }, key);
  }
  createTemplate(p: Payload, key: string) {
    return this.request("/templates", "POST", p, key);
  }
  publishTemplate(id: string) {
    return this.request(`/templates/${encodeURIComponent(id)}/publish`, "POST");
  }
  async createAutomation(p: Payload, key: string) {
    await assertLiveGates();
    return this.request(
      "/automations",
      "POST",
      { ...p, status: "disabled" },
      key,
    );
  }
  stopAutomation(id: string) {
    return this.request(`/automations/${encodeURIComponent(id)}`, "PATCH", {
      status: "disabled",
    });
  }
  async sendBusinessEvent(p: Payload, key: string) {
    await assertLiveGates();
    return this.request("/events/send", "POST", p, key);
  }
  async createBroadcast(p: Payload, key: string) {
    await assertLiveGates();
    return this.request("/broadcasts", "POST", { ...p, send: false }, key);
  }
  async sendBroadcast(id: string, key: string) {
    await assertLiveGates();
    return this.request(
      `/broadcasts/${encodeURIComponent(id)}/send`,
      "POST",
      {},
      key,
    );
  }
  async getUsage() {
    return {
      verified: false,
      message: "官方用量接口未核实；请在 Resend 账户后台确认报价和额度",
    };
  }
}
export const provider: EmailProvider = DRY_RUN
  ? new MockProvider()
  : new ResendProvider();
export async function liveGateErrors() {
  const store = await db.store.findUnique({ where: { id: STORE_ID } });
  const errors: string[] = [];
  if (DRY_RUN) errors.push("当前为 DRY_RUN 模拟发送");
  if (DEMO) errors.push("DEMO 数据不可用于真实发送");
  if (!store?.liveEnabled) errors.push("运营开关尚未开启");
  if (!process.env.RESEND_API_KEY) errors.push("尚未配置 Resend 凭据");
  if (!process.env.SHOPIFY_ACCESS_TOKEN || store?.connectStatus !== "connected")
    errors.push("Shopify 尚未验证连接");
  if (
    !store?.domainVerified ||
    !store.domainCheckedAt ||
    Date.now() - +store.domainCheckedAt > 86400000
  )
    errors.push("发件域名需重新验证");
  if (!process.env.POLICY_APPROVAL_REFERENCE)
    errors.push("尚未配置店铺及素材的政策许可记录");
  if (process.env.BILLING_VERIFIED !== "true")
    errors.push("账号额度与计费尚未确认");
  if (process.env.LIVE_INTEGRATION_VERIFIED !== "true")
    errors.push("受控测试邮箱及签名回调尚未完成集成验收");
  if (process.env.AUTOMATION_EXIT_VERIFIED !== "true")
    errors.push("托管流程的退订/购买退出尚未验证");
  return errors;
}
export async function assertLiveGates() {
  const errors = await liveGateErrors();
  if (errors.length) throw new Error(errors.join("；"));
}
