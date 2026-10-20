import { db, STORE_ID, DEMO } from "./db";
import { normalizeEmail } from "./domain";
import { ProviderError } from "./providers";
export const CUSTOMERS_QUERY = `query StudioCustomers($cursor: String) {
  customers(first: 100, after: $cursor) {
    nodes { id firstName lastName tags numberOfOrders amountSpent { amount currencyCode } updatedAt defaultEmailAddress { emailAddress marketingState marketingUpdatedAt marketingOptInLevel } }
    pageInfo { hasNextPage endCursor }
  }
}`;
export const ORDERS_QUERY = `query StudioOrders($cursor: String) {
  orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true) {
    nodes { id customer { id } createdAt cancelledAt displayFinancialStatus totalPriceSet { shopMoney { amount currencyCode } } }
    pageInfo { hasNextPage endCursor }
  }
}`;
export const CUSTOMER_ORDER_STATE_QUERY = `query StudioCustomerOrderState($id: ID!) {
  customer(id: $id) { numberOfOrders amountSpent { amount currencyCode } lastOrder { createdAt } }
}`;
export const UNSUBSCRIBE_MUTATION = `mutation StudioUnsubscribe($input: CustomerEmailMarketingConsentUpdateInput!) {
  customerEmailMarketingConsentUpdate(input: $input) { customer { id } userErrors { field message } }
}`;
export function shopDomain() {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN || "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))
    throw new Error("请配置有效的 myshopify.com 店铺域名");
  return domain;
}
export async function graphql(
  query: string,
  variables: Record<string, unknown> = {},
) {
  if (DEMO) throw new Error("DEMO 模式不访问真实店铺");
  if (!process.env.SHOPIFY_ACCESS_TOKEN)
    throw new Error("缺少 SHOPIFY_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2026-07";
  if (!/^\d{4}-(01|04|07|10)$/.test(version))
    throw new Error("Shopify API 版本格式无效");
  const r = await fetch(
    `https://${shopDomain()}/admin/api/${version}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!r.ok)
    throw new ProviderError(`Shopify ${r.status}：请检查授权及权限`, r.status);
  const result = await r.json();
  if (result.errors)
    throw new Error(
      `Shopify GraphQL: ${result.errors.map((e: { message: string }) => e.message).join("; ")}`,
    );
  return result.data;
}
export async function importCustomer(
  c: Record<string, any>,
  sourceEventId: string,
  source = "shopify-sync",
) {
  if (c.defaultEmailAddress)
    c = {
      ...c,
      email: c.defaultEmailAddress.emailAddress,
      emailMarketingConsent: {
        marketingState: c.defaultEmailAddress.marketingState,
        consentUpdatedAt: c.defaultEmailAddress.marketingUpdatedAt,
      },
    };
  if (!c.email) return;
  const email = normalizeEmail(c.email);
  const state = c.emailMarketingConsent?.marketingState || "NOT_SUBSCRIBED";
  const at = new Date(
    c.emailMarketingConsent?.consentUpdatedAt || c.updatedAt || 0,
  );
  return db.$transaction(async (tx) => {
    const old = await tx.contact.findUnique({
      where: { storeId_email: { storeId: STORE_ID, email } },
    });
    const suppression = await tx.suppression.findUnique({
      where: { storeId_email: { storeId: STORE_ID, email } },
    });
    const fresh = !old?.consentUpdatedAt || +at >= +old.consentUpdatedAt;
    const deny = ["UNSUBSCRIBED", "REDACTED", "INVALID"].includes(state);
    // A denial is sticky even if an older message arrives late. Subscribes never erase suppression.
    const effectiveState =
      suppression || old?.suppressedAt
        ? "UNSUBSCRIBED"
        : fresh || deny
          ? state
          : old!.marketingState;
    const contact = await tx.contact.upsert({
      where: { storeId_email: { storeId: STORE_ID, email } },
      create: {
        storeId: STORE_ID,
        email,
        shopifyCustomerGid: c.id,
        firstName: c.firstName || "",
        lastName: c.lastName || "",
        marketingState: effectiveState,
        consentSource: source,
        consentAt: state === "SUBSCRIBED" ? at : null,
        consentUpdatedAt: at,
        tags: JSON.stringify(c.tags || []),
        ordersCount: Number(c.numberOfOrders || 0),
        totalSpent: Number(c.amountSpent?.amount || 0),
      },
      update: {
        firstName: c.firstName || old?.firstName || "",
        lastName: c.lastName || old?.lastName || "",
        marketingState: effectiveState,
        consentUpdatedAt: fresh ? at : old?.consentUpdatedAt,
        ordersCount: Number(c.numberOfOrders ?? old?.ordersCount ?? 0),
        totalSpent: Number(c.amountSpent?.amount ?? old?.totalSpent ?? 0),
        tags: JSON.stringify(c.tags || JSON.parse(old?.tags || "[]")),
        syncAt: new Date(),
      },
    });
    if (old?.marketingState !== effectiveState)
      await tx.consentHistory.upsert({
        where: {
          storeId_contactId_provider_sourceEventId: {
            storeId: STORE_ID,
            contactId: contact.id,
            provider: "shopify",
            sourceEventId,
          },
        },
        create: {
          storeId: STORE_ID,
          contactId: contact.id,
          provider: "shopify",
          sourceEventId,
          oldState: old?.marketingState || "UNKNOWN",
          newState: effectiveState,
          source,
          occurredAt: at,
        },
        update: {},
      });
    if (deny) {
      await tx.suppression.upsert({
        where: { storeId_email: { storeId: STORE_ID, email } },
        create: { storeId: STORE_ID, email, reason: state, source },
        update: {},
      });
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          suppressedAt: old?.suppressedAt || new Date(),
          unsubscribedAt: state === "UNSUBSCRIBED" ? new Date() : undefined,
        },
      });
    }
    await tx.outboxJob.upsert({
      where: { key: `contact:${STORE_ID}:${sourceEventId}:${contact.id}` },
      create: {
        storeId: STORE_ID,
        key: `contact:${STORE_ID}:${sourceEventId}:${contact.id}`,
        kind: "sync_contact",
        payloadJson: JSON.stringify({ contactId: contact.id }),
      },
      update: {},
    });
    return contact;
  });
}
export async function syncCustomers() {
  let cursor: string | null = null;
  let count = 0;
  do {
    const result = await graphql(CUSTOMERS_QUERY, { cursor });
    for (const c of result.customers.nodes) {
      await importCustomer(c, `sync:${c.id}:${c.updatedAt}`);
      count++;
    }
    cursor = result.customers.pageInfo.hasNextPage
      ? result.customers.pageInfo.endCursor
      : null;
  } while (cursor);
  do {
    const result = await graphql(ORDERS_QUERY, { cursor });
    for (const o of result.orders.nodes) {
      const contact = o.customer?.id
        ? await db.contact.findFirst({
            where: { storeId: STORE_ID, shopifyCustomerGid: o.customer.id },
          })
        : null;
      if (!contact) continue;
      await db.orderSummary.upsert({
        where: {
          storeId_shopifyOrderGid: { storeId: STORE_ID, shopifyOrderGid: o.id },
        },
        create: {
          storeId: STORE_ID,
          shopifyOrderGid: o.id,
          contactId: contact.id,
          financialStatus: o.displayFinancialStatus,
          placedAt: new Date(o.createdAt),
          currency: o.totalPriceSet.shopMoney.currencyCode,
          totalAmount: Number(o.totalPriceSet.shopMoney.amount),
          cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
        },
        update: {
          financialStatus: o.displayFinancialStatus,
          cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
        },
      });
      if (!contact.lastOrderAt || +contact.lastOrderAt < +new Date(o.createdAt))
        await db.contact.update({
          where: { id: contact.id },
          data: { lastOrderAt: new Date(o.createdAt) },
        });
    }
    cursor = result.orders.pageInfo.hasNextPage
      ? result.orders.pageInfo.endCursor
      : null;
  } while (cursor);
  await db.store.update({
    where: { id: STORE_ID },
    data: { lastSyncAt: new Date(), connectStatus: "connected" },
  });
  return count;
}
