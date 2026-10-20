import { z } from "zod";
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export type MarketingContact = {
  email: string;
  marketingState: string;
  suppressedAt?: Date | string | null;
  unsubscribedAt?: Date | string | null;
  paused?: boolean;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt?: Date | string | null;
  tags?: string;
};
export function eligibility(contact: MarketingContact, suppressed = false) {
  if (contact.marketingState !== "SUBSCRIBED")
    return { allowed: false, reason: "没有有效的营销订阅许可" };
  if (suppressed || contact.suppressedAt || contact.unsubscribedAt)
    return { allowed: false, reason: "联系人已退订或被加入抑制名单" };
  if (contact.paused) return { allowed: false, reason: "已手动暂停营销" };
  return { allowed: true, reason: "营销许可有效" };
}
export const ruleSchema = z.object({
  field: z.enum([
    "marketingState",
    "ordersCount",
    "totalSpent",
    "daysSinceOrder",
    "tag",
  ]),
  op: z.enum(["eq", "neq", "gte", "lte", "contains"]),
  value: z.union([z.string(), z.number()]),
});
export const rulesSchema = z.object({
  mode: z.enum(["AND", "OR"]),
  rules: z.array(ruleSchema).min(1).max(20),
});
export type Rules = z.infer<typeof rulesSchema>;
export function matchesRules(
  c: MarketingContact,
  rules: Rules,
  now = new Date(),
): boolean {
  const matches = rules.rules.map((r) => {
    const val =
      r.field === "daysSinceOrder"
        ? c.lastOrderAt
          ? Math.floor((+now - +new Date(c.lastOrderAt)) / 86400000)
          : null
        : r.field === "tag"
          ? JSON.parse(c.tags || "[]")
          : c[r.field];
    if (val === null) return false;
    if (r.op === "eq") return String(val) === String(r.value);
    if (r.op === "neq") return String(val) !== String(r.value);
    if (r.op === "gte") return Number(val) >= Number(r.value);
    if (r.op === "lte") return Number(val) <= Number(r.value);
    return Array.isArray(val) && val.includes(String(r.value));
  });
  return rules.mode === "AND" ? matches.every(Boolean) : matches.some(Boolean);
}
export const nodeSchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(80),
  type: z.enum([
    "trigger",
    "condition",
    "delay",
    "wait_for_event",
    "send_email",
    "end",
  ]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    label: z.string().max(100),
    eventName: z.string().max(150).optional(),
    templateId: z.string().optional(),
    duration: z.number().int().min(1).max(2592000).optional(),
    field: z.enum(["ordersCount", "totalSpent", "marketingState"]).optional(),
    op: z.enum(["eq", "neq", "gte", "lte"]).optional(),
    value: z.union([z.string(), z.number()]).optional(),
  }),
});
export const workflowSchema = z.object({
  nodes: z.array(nodeSchema).min(2).max(100),
  edges: z
    .array(
      z.object({
        id: z.string(),
        source: z.string(),
        target: z.string(),
        sourceHandle: z.enum(["true", "false", "event", "timeout"]).nullish(),
        label: z.string().optional(),
      }),
    )
    .max(200),
});
export type Definition = z.infer<typeof workflowSchema>;
export type TemplateRef = {
  id: string;
  publishedAt: Date | string | null;
  resendTemplateId?: string | null;
};
export function validateWorkflow(input: unknown, templates: TemplateRef[]) {
  const parsed = workflowSchema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
      warnings: [] as string[],
    };
  const d = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(d.nodes.map((n) => n.id));
  if (ids.size !== d.nodes.length) errors.push("节点 key 必须唯一");
  if (new Set(d.edges.map((e) => e.id)).size !== d.edges.length)
    errors.push("连接 key 必须唯一");
  const triggers = d.nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) errors.push("必须有且只有一个触发节点");
  if (!d.nodes.some((n) => n.type === "send_email"))
    errors.push("至少需要一个发送邮件节点");
  for (const e of d.edges)
    if (!ids.has(e.source) || !ids.has(e.target))
      errors.push(`连接 ${e.id} 指向不存在的节点`);
  for (const n of d.nodes) {
    const out = d.edges.filter((e) => e.source === n.id);
    if (
      n.type === "trigger" &&
      (!n.data.eventName || d.edges.some((e) => e.target === n.id))
    )
      errors.push("触发节点需要事件名称且不能有入边");
    if (n.type === "end" && out.length) errors.push("结束节点不能有出口");
    if (n.type === "condition" || n.type === "wait_for_event") {
      const handles =
        n.type === "condition" ? ["true", "false"] : ["event", "timeout"];
      if (
        out.length !== 2 ||
        !handles.every(
          (h) => out.filter((e) => e.sourceHandle === h).length === 1,
        )
      )
        errors.push(`${n.data.label} 需要明确的两个分支出口`);
    } else if (n.type !== "end" && (out.length !== 1 || out[0]?.sourceHandle))
      errors.push(`${n.data.label} 需要一个普通出口`);
    if (
      n.type === "condition" &&
      (!n.data.field || !n.data.op || n.data.value === undefined)
    )
      errors.push("条件节点缺少规则");
    if ((n.type === "delay" || n.type === "wait_for_event") && !n.data.duration)
      errors.push("延迟或超时需设置为 1 秒至 30 天");
    if (n.type === "wait_for_event" && !n.data.eventName)
      errors.push("等待事件节点需要事件名称");
    if (
      n.type === "send_email" &&
      !templates.some((t) => t.id === n.data.templateId && t.publishedAt)
    )
      errors.push(`${n.data.label} 需要已发布的模板`);
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  function walk(id: string) {
    if (active.has(id)) {
      errors.push("工作流不能包含环");
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    active.add(id);
    d.edges.filter((e) => e.source === id).forEach((e) => walk(e.target));
    active.delete(id);
  }
  if (triggers[0]) walk(triggers[0].id);
  if (visited.size !== ids.size) errors.push("所有节点都必须从触发节点可达");
  if (d.nodes.some((n) => n.type === "delay" || n.type === "wait_for_event"))
    warnings.push(
      "托管等待期间的退订/购买退出尚未实测，真实发布暂不开放；模拟会快进时间。",
    );
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings };
}
export function compileWorkflow(d: Definition, templates: TemplateRef[]) {
  const check = validateWorkflow(d, templates);
  if (!check.valid) throw new Error(check.errors.join("；"));
  // Complex nodes remain simulation-only until their exact REST mapping and exit behavior are verified.
  const unsupported = d.nodes.filter(
    (n) => !["trigger", "send_email", "end"].includes(n.type),
  );
  if (unsupported.length)
    throw new Error(
      `以下节点仅支持本地模拟，尚未开放真实编译：${unsupported.map((n) => n.type).join(", ")}`,
    );
  return {
    steps: d.nodes
      .filter((n) => n.type !== "end")
      .map((n) => ({
        key: n.id,
        type: n.type,
        config:
          n.type === "trigger"
            ? { event_name: n.data.eventName }
            : {
                template: {
                  id:
                    templates.find((t) => t.id === n.data.templateId)
                      ?.resendTemplateId || `demo_${n.data.templateId}`,
                },
              },
      })),
    connections: d.edges
      .filter((e) => d.nodes.find((n) => n.id === e.target)?.type !== "end")
      .map((e) => ({ from: e.source, to: e.target })),
  };
}
export type Trace = {
  nodeId: string;
  label: string;
  action: string;
  status: string;
  at: string;
};
export function simulate(
  d: Definition,
  c: MarketingContact,
  opts: {
    suppressed?: boolean;
    eventReceived?: boolean;
    purchaseDuringDelay?: boolean;
    unsubscribeDuringDelay?: boolean;
  } = {},
) {
  const trace: Trace[] = [];
  let now = new Date();
  let contact = { ...c };
  let node = d.nodes.find((n) => n.type === "trigger");
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    let branch: string | undefined;
    let action = "";
    let status = "passed";
    if (node.type === "trigger") action = `接收事件 ${node.data.eventName}`;
    if (node.type === "delay" || node.type === "wait_for_event") {
      now = new Date(+now + (node.data.duration || 1) * 1000);
      action = `模拟快进 ${node.data.duration} 秒`;
      if (opts.purchaseDuringDelay) contact.ordersCount += 1;
      if (opts.unsubscribeDuringDelay) contact.marketingState = "UNSUBSCRIBED";
      if (node.type === "wait_for_event") {
        branch = opts.eventReceived ? "event" : "timeout";
        action =
          branch === "event"
            ? `模拟收到 ${node.data.eventName}`
            : "模拟等待超时";
      }
    }
    if (node.type === "condition") {
      const pass = matchesRules(contact, {
        mode: "AND",
        rules: [
          {
            field: node.data.field!,
            op: node.data.op!,
            value: node.data.value!,
          },
        ],
      });
      branch = String(pass);
      action = `${node.data.field} ${node.data.op} ${node.data.value} → ${pass ? "满足" : "不满足"}`;
    }
    if (node.type === "send_email") {
      const gate = eligibility(contact, opts.suppressed);
      status = gate.allowed ? "simulated" : "blocked";
      action = gate.allowed
        ? "DEMO · 记录一次发送决策，不投递邮件"
        : gate.reason;
    }
    if (node.type === "end") action = "流程结束";
    trace.push({
      nodeId: node.id,
      label: node.data.label,
      action,
      status,
      at: now.toISOString(),
    });
    if (status === "blocked") break;
    const edge = d.edges.find(
      (e) => e.source === node!.id && (!branch || e.sourceHandle === branch),
    );
    node = edge ? d.nodes.find((n) => n.id === edge.target) : undefined;
  }
  return trace;
}
