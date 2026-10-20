-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "connectStatus" TEXT NOT NULL DEFAULT 'demo',
    "tokenReference" TEXT,
    "liveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "domainVerified" BOOLEAN NOT NULL DEFAULT false,
    "domainCheckedAt" TIMESTAMP(3),
    "policyReference" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyCustomerGid" TEXT,
    "resendContactId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "marketingState" TEXT NOT NULL DEFAULT 'NOT_SUBSCRIBED',
    "consentSource" TEXT NOT NULL DEFAULT 'unknown',
    "consentAt" TIMESTAMP(3),
    "consentUpdatedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "suppressedAt" TIMESTAMP(3),
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    "tags" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "syncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "oldState" TEXT NOT NULL,
    "newState" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSummary" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyOrderGid" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "financialStatus" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "OrderSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbandonedCheckout" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyCheckoutGid" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "encryptedCheckoutUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "reminderStatus" TEXT NOT NULL DEFAULT 'blocked',
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "AbandonedCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "rulesJson" TEXT NOT NULL,
    "resendSegmentId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "schemaJson" TEXT NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "resendTemplateId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
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
    "lastDeployedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "businessEventKey" TEXT NOT NULL,
    "resendRunId" TEXT,
    "status" TEXT NOT NULL,
    "traceJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "resendEmailId" TEXT,
    "contactId" TEXT,
    "workflowId" TEXT,
    "eventType" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "rawBodyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxJob" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "resendBroadcastId" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "WorkflowExecution_storeId_workflowId_businessEventKey_conta_key" ON "WorkflowExecution"("storeId", "workflowId", "businessEventKey", "contactId");

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
