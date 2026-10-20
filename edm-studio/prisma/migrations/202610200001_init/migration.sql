-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "connectStatus" TEXT NOT NULL DEFAULT 'demo',
    "tokenReference" TEXT,
    "liveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "domainVerified" BOOLEAN NOT NULL DEFAULT false,
    "domainCheckedAt" DATETIME,
    "policyReference" TEXT,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "shopifyCustomerGid" TEXT,
    "resendContactId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "marketingState" TEXT NOT NULL DEFAULT 'NOT_SUBSCRIBED',
    "consentSource" TEXT NOT NULL DEFAULT 'unknown',
    "consentAt" DATETIME,
    "consentUpdatedAt" DATETIME,
    "unsubscribedAt" DATETIME,
    "suppressedAt" DATETIME,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" REAL NOT NULL DEFAULT 0,
    "lastOrderAt" DATETIME,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "syncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ConsentHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "oldState" TEXT NOT NULL,
    "newState" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "shopifyOrderGid" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "financialStatus" TEXT NOT NULL,
    "placedAt" DATETIME NOT NULL,
    "currency" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "cancelledAt" DATETIME
);

-- CreateTable
CREATE TABLE "AbandonedCheckout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "shopifyCheckoutGid" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "encryptedCheckoutUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "reminderStatus" TEXT NOT NULL DEFAULT 'blocked',
    "sentAt" DATETIME
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "rulesJson" TEXT NOT NULL,
    "resendSegmentId" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "schemaJson" TEXT NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "resendTemplateId" TEXT,
    "publishedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'welcome',
    "draftJson" TEXT NOT NULL,
    "publishedJson" TEXT,
    "compiledJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "resendAutomationId" TEXT,
    "lastDeployedAt" DATETIME,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "businessEventKey" TEXT NOT NULL,
    "resendRunId" TEXT,
    "status" TEXT NOT NULL,
    "traceJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "resendEmailId" TEXT,
    "contactId" TEXT,
    "workflowId" TEXT,
    "eventType" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT NOT NULL DEFAULT '{}'
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "rawBodyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OutboxJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "leaseToken" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "resendBroadcastId" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_shopDomain_key" ON "Store"("shopDomain");

-- CreateIndex
CREATE INDEX "Contact_storeId_marketingState_idx" ON "Contact"("storeId", "marketingState");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_storeId_email_key" ON "Contact"("storeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_storeId_shopifyCustomerGid_key" ON "Contact"("storeId", "shopifyCustomerGid");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentHistory_storeId_contactId_provider_sourceEventId_key" ON "ConsentHistory"("storeId", "contactId", "provider", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSummary_storeId_shopifyOrderGid_key" ON "OrderSummary"("storeId", "shopifyOrderGid");

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCheckout_storeId_shopifyCheckoutGid_key" ON "AbandonedCheckout"("storeId", "shopifyCheckoutGid");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowExecution_storeId_workflowId_businessEventKey_contactId_key" ON "WorkflowExecution"("storeId", "workflowId", "businessEventKey", "contactId");

-- CreateIndex
CREATE INDEX "EmailEvent_storeId_occurredAt_idx" ON "EmailEvent"("storeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_storeId_providerEventId_key" ON "EmailEvent"("storeId", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_storeId_email_key" ON "Suppression"("storeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_storeId_provider_eventId_key" ON "WebhookReceipt"("storeId", "provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxJob_key_key" ON "OutboxJob"("key");

-- CreateIndex
CREATE INDEX "OutboxJob_status_nextRunAt_idx" ON "OutboxJob"("status", "nextRunAt");
