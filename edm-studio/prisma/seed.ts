import { db, STORE_ID, DEMO } from "../src/lib/db";
import { renderEmail, defaultContent } from "../src/lib/email";
import type { Definition } from "../src/lib/domain";
export function preset(
  kind: "welcome" | "post-purchase" | "abandoned",
): Definition {
  const start = {
    id: "trigger",
    type: "trigger" as const,
    position: { x: 180, y: 40 },
    data: {
      label:
        kind === "welcome"
          ? "新客户订阅"
          : kind === "post-purchase"
            ? "订单支付成功"
            : "检测到未完成结账",
      eventName:
        kind === "welcome"
          ? "shopify.customer.subscribed"
          : kind === "post-purchase"
            ? "shopify.order.paid"
            : "shopify.checkout.abandoned",
    },
  };
  const send = {
    id: "send",
    type: "send_email" as const,
    position: { x: 180, y: kind === "welcome" ? 220 : 520 },
    data: {
      label:
        kind === "welcome"
          ? "发送欢迎邮件"
          : kind === "post-purchase"
            ? "发送购后关怀"
            : "发送结账提醒",
      templateId:
        kind === "welcome"
          ? "tpl-welcome"
          : kind === "post-purchase"
            ? "tpl-care"
            : "tpl-checkout",
    },
  };
  const end = {
    id: "end",
    type: "end" as const,
    position: { x: 180, y: kind === "welcome" ? 400 : 700 },
    data: { label: "结束流程" },
  };
  if (kind === "welcome")
    return {
      nodes: [start, send, end],
      edges: [
        { id: "a", source: "trigger", target: "send" },
        { id: "b", source: "send", target: "end" },
      ],
    };
  return {
    nodes: [
      start,
      {
        id: "delay",
        type: "delay",
        position: { x: 180, y: 200 },
        data: {
          label: kind === "post-purchase" ? "等待 3 天" : "等待 30 分钟",
          duration: kind === "post-purchase" ? 259200 : 1800,
        },
      },
      {
        id: "condition",
        type: "condition",
        position: { x: 180, y: 360 },
        data: {
          label: kind === "post-purchase" ? "仍然允许营销？" : "仍未购买？",
          field: kind === "post-purchase" ? "marketingState" : "ordersCount",
          op: "eq",
          value: kind === "post-purchase" ? "SUBSCRIBED" : 0,
        },
      },
      send,
      end,
    ],
    edges: [
      { id: "a", source: "trigger", target: "delay" },
      { id: "b", source: "delay", target: "condition" },
      {
        id: "c",
        source: "condition",
        sourceHandle: "true",
        target: "send",
        label: "满足",
      },
      {
        id: "d",
        source: "condition",
        sourceHandle: "false",
        target: "end",
        label: "不满足",
      },
      { id: "e", source: "send", target: "end" },
    ],
  };
}
export async function seed() {
  await db.store.upsert({
    where: { id: STORE_ID },
    create: {
      id: STORE_ID,
      name: DEMO ? "FormWink · DEMO" : "我的 Shopify 店铺",
      shopDomain: DEMO
        ? "1jqt0g-4z.myshopify.com"
        : process.env.SHOPIFY_SHOP_DOMAIN || "unconfigured.myshopify.com",
      connectStatus: DEMO ? "demo" : "disconnected",
    },
    update: {},
  });
  if (!DEMO) return;
  const templates = [
    [
      "tpl-welcome",
      "很高兴，与你相遇",
      "Welcome",
      "Welcome to FormWink, {{ first_name }}",
      "A little colour. A whole new mood.",
    ],
    [
      "tpl-care",
      "让喜欢，陪伴更久",
      "Post-purchase",
      "为你准备的一份日常养护指南",
      "Keep your favourite corner glowing.",
    ],
    [
      "tpl-checkout",
      "你的灵感，还在这里",
      "Checkout Reminder",
      "你喜欢的好物，已为你留好",
      "Your colourful corner is waiting.",
    ],
    [
      "tpl-news",
      "十月的一点新意",
      "Newsletter",
      "本月灵感手记 · 为生活留一点空白",
      "A fresh perspective for your room.",
    ],
  ];
  for (const [id, name, category, subject, heading] of templates) {
    const content = { ...defaultContent, heading };
    const rendered = await renderEmail(content);
    await db.emailTemplate.upsert({
      where: { id },
      create: {
        id,
        storeId: STORE_ID,
        name,
        category,
        subject,
        schemaJson: JSON.stringify(content),
        ...rendered,
        publishedAt: new Date(),
        resendTemplateId: `demo_${id}`,
      },
      update: {},
    });
  }
  const names = [
    ["Alex", "Morgan"],
    ["Mia", "Chen"],
    ["Oliver", "Taylor"],
    ["Emma", "Wilson"],
    ["Noah", "Lee"],
    ["Ava", "Martin"],
    ["Liam", "Wang"],
    ["Sofia", "Anderson"],
    ["Ethan", "Zhang"],
    ["Isabella", "Brown"],
    ["Lucas", "Garcia"],
    ["Amelia", "Davis"],
    ["James", "Kim"],
    ["Charlotte", "Lopez"],
    ["Henry", "Clark"],
    ["Harper", "Lewis"],
    ["Leo", "Walker"],
    ["Chloe", "Hall"],
  ];
  for (let i = 0; i < names.length; i++) {
    const [firstName, lastName] = names[i];
    const state =
      i % 7 === 5 ? "UNSUBSCRIBED" : i % 7 === 6 ? "PENDING" : "SUBSCRIBED";
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
    const consentAt = new Date(Date.now() - (i + 2) * 86400000);
    const contact = await db.contact.upsert({
      where: { id: `contact-${i + 1}` },
      create: {
        id: `contact-${i + 1}`,
        storeId: STORE_ID,
        shopifyCustomerGid: `gid://shopify/Customer/${10000 + i}`,
        resendContactId: `demo_contact_${i + 1}`,
        email,
        firstName,
        lastName,
        marketingState: state,
        consentSource: "DEMO · Shopify 订阅表单",
        consentAt,
        consentUpdatedAt: consentAt,
        ordersCount: i % 5,
        totalSpent: (i % 5) * 68.5,
        lastOrderAt: i % 5 ? new Date(Date.now() - (i + 1) * 86400000) : null,
        tags: JSON.stringify(i % 3 === 0 ? ["VIP", "home"] : ["home"]),
        suppressedAt: state === "UNSUBSCRIBED" ? consentAt : null,
      },
      update: {},
    });
    await db.consentHistory.upsert({
      where: {
        storeId_contactId_provider_sourceEventId: {
          storeId: STORE_ID,
          contactId: contact.id,
          provider: "demo",
          sourceEventId: `seed-${i}`,
        },
      },
      create: {
        storeId: STORE_ID,
        contactId: contact.id,
        provider: "demo",
        sourceEventId: `seed-${i}`,
        oldState: "UNKNOWN",
        newState: state,
        source: "DEMO · 模拟订阅记录",
        occurredAt: consentAt,
      },
      update: {},
    });
    if (state === "UNSUBSCRIBED")
      await db.suppression.upsert({
        where: { storeId_email: { storeId: STORE_ID, email } },
        create: {
          storeId: STORE_ID,
          email,
          reason: "DEMO · 用户退订",
          source: "demo",
        },
        update: {},
      });
  }
  for (const s of [
    {
      id: "seg-all",
      name: "所有可营销客户",
      description: "有效订阅，且不在抑制名单中",
      rules: [{ field: "marketingState", op: "eq", value: "SUBSCRIBED" }],
    },
    {
      id: "seg-new",
      name: "初次见面的朋友",
      description: "已订阅，还没有完成第一笔订单",
      rules: [{ field: "ordersCount", op: "eq", value: 0 }],
    },
    {
      id: "seg-vip",
      name: "常来常往的老朋友",
      description: "累计购买至少 3 次的订阅客户",
      rules: [{ field: "ordersCount", op: "gte", value: 3 }],
    },
  ])
    await db.segment.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        storeId: STORE_ID,
        name: s.name,
        description: s.description,
        rulesJson: JSON.stringify({ mode: "AND", rules: s.rules }),
      },
      update: {},
    });
  for (const [kind, name, description] of [
    ["welcome", "欢迎新朋友", "从第一次订阅，开始一段长久的联系。"],
    ["post-purchase", "购买后的贴心关怀", "在合适的时间，送上一份养护指南。"],
    ["abandoned", "找回未完成的心动", "结账提醒 · 付款退出验证前保持锁定。"],
  ] as const)
    await db.workflow.upsert({
      where: { id: `wf-${kind}` },
      create: {
        id: `wf-${kind}`,
        storeId: STORE_ID,
        name,
        description,
        kind,
        draftJson: JSON.stringify(preset(kind)),
        status: kind === "abandoned" ? "locked" : "draft",
      },
      update: {},
    });
  await db.campaign.upsert({
    where: { id: "campaign-october" },
    create: {
      id: "campaign-october",
      storeId: STORE_ID,
      name: "十月灵感手记",
      templateId: "tpl-news",
      segmentId: "seg-all",
    },
    update: {},
  });
  for (let day = 6; day >= 0; day--)
    for (let j = 0; j < 7 + day; j++)
      for (const type of [
        "email.sent",
        "email.delivered",
        ...(j % 3 === 0 ? ["email.clicked"] : []),
      ]) {
        const id = `seed-${day}-${j}-${type}`;
        await db.emailEvent.upsert({
          where: {
            storeId_providerEventId: { storeId: STORE_ID, providerEventId: id },
          },
          create: {
            storeId: STORE_ID,
            providerEventId: id,
            contactId: `contact-${(j % 18) + 1}`,
            eventType: type,
            demo: true,
            occurredAt: new Date(Date.now() - day * 86400000 - j * 60000),
            metadataJson: JSON.stringify({
              source: "seed",
              label: "DEMO · 模拟历史样本",
            }),
          },
          update: {},
        });
      }
}
if (process.argv[1]?.endsWith("seed.ts"))
  seed()
    .then(() => console.log("Seed complete: idempotent DEMO fixtures."))
    .finally(() => db.$disconnect());
