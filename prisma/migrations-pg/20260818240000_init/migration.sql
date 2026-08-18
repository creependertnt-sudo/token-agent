-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('preference', 'business', 'product', 'fact');

-- CreateEnum
CREATE TYPE "AIServiceType" AS ENUM ('SALES', 'LIGHT', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "tokenBalance" INTEGER NOT NULL DEFAULT 0,
    "freeChatCount" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "MemoryCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitWindow" (
    "userId" TEXT NOT NULL,
    "windowStart" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitWindow_pkey" PRIMARY KEY ("userId","windowStart")
);

-- CreateTable
CREATE TABLE "CustomerMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "industry" TEXT NOT NULL DEFAULT '',
    "needs" TEXT NOT NULL DEFAULT '',
    "budget" TEXT NOT NULL DEFAULT '',
    "painPoints" TEXT NOT NULL DEFAULT '',
    "purchaseHistory" TEXT NOT NULL DEFAULT '',
    "recommendedModel" TEXT NOT NULL DEFAULT '',
    "preferences" TEXT NOT NULL DEFAULT '',
    "customerStage" TEXT NOT NULL DEFAULT 'NEW',
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "lastIntent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModel" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "contextWindow" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" "AIServiceType" NOT NULL,
    "tokenCost" INTEGER NOT NULL,
    "modelId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSelectedService" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSelectedService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenPackage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenAmount" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "tokenAmount" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "serviceType" TEXT,
    "modelName" TEXT,
    "tokenCost" INTEGER,
    "tokenBalanceAfter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesKnowledge" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelCapability" (
    "id" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenCost" INTEGER NOT NULL,
    "positioning" TEXT NOT NULL,
    "suitableFor" TEXT NOT NULL,
    "notSuitableFor" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorKnowledge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" TEXT NOT NULL,
    "differences" TEXT NOT NULL,
    "talkTrack" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelConfig" (
    "id" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "suitableFor" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "tokenCost" INTEGER NOT NULL,
    "maxContext" INTEGER NOT NULL,
    "systemInstructions" TEXT NOT NULL DEFAULT '',
    "enableReasoning" BOOLEAN NOT NULL DEFAULT false,
    "memoryRounds" INTEGER NOT NULL DEFAULT 16,
    "keywords" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesConversion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "packageId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesStrategy" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "customerType" TEXT NOT NULL DEFAULT '*',
    "name" TEXT NOT NULL,
    "guidelines" TEXT NOT NULL,
    "talkTrack" TEXT NOT NULL,
    "forbidden" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "matchKeywords" TEXT NOT NULL,
    "typicalNeeds" TEXT NOT NULL,
    "talkTrack" TEXT NOT NULL,
    "defaultRecommend" TEXT NOT NULL DEFAULT '',
    "clarifyingQuestions" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRecommendRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "customerType" TEXT NOT NULL DEFAULT '*',
    "intent" TEXT NOT NULL DEFAULT '*',
    "budgetLevel" TEXT NOT NULL DEFAULT '*',
    "techLevel" TEXT NOT NULL DEFAULT '*',
    "matchKeywords" TEXT NOT NULL DEFAULT '',
    "requireKeywords" TEXT NOT NULL DEFAULT '',
    "excludeKeywords" TEXT NOT NULL DEFAULT '',
    "recommendServiceType" TEXT NOT NULL,
    "reasonTemplate" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRecommendRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTrace" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "conversationId" TEXT,
    "serviceType" TEXT NOT NULL,
    "intent" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "latency" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolCallLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traceId" TEXT NOT NULL DEFAULT '',
    "arguments" TEXT,
    "error" TEXT,
    "latency" INTEGER,

    CONSTRAINT "ToolCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAnalytics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionAnalytics" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesFunnelLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "packageId" TEXT,
    "strategy" TEXT,
    "shown" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesFunnelLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentErrorLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "intent" TEXT,
    "toolUsed" TEXT,
    "toolSuccess" BOOLEAN,
    "recommendedPackageId" TEXT,
    "pushStrategy" TEXT,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "modelType" TEXT,
    "intent" TEXT,
    "toolsUsed" TEXT,
    "toolCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "duration" INTEGER,
    "toolDuration" INTEGER,
    "llmDuration" INTEGER,
    "memoryInjectedCount" INTEGER,
    "memoryUsedCount" INTEGER,
    "memoryCategory" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentFeedback" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToolCall" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "arguments" TEXT,
    "resultSummary" TEXT,
    "success" BOOLEAN NOT NULL,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "AgentMemory_userId_idx" ON "AgentMemory"("userId");

-- CreateIndex
CREATE INDEX "AgentMemory_userId_category_idx" ON "AgentMemory"("userId", "category");

-- CreateIndex
CREATE INDEX "AgentMemory_userId_updatedAt_idx" ON "AgentMemory"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "RateLimitWindow_windowStart_idx" ON "RateLimitWindow"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMemory_userId_key" ON "CustomerMemory"("userId");

-- CreateIndex
CREATE INDEX "CustomerMemory_customerStage_idx" ON "CustomerMemory"("customerStage");

-- CreateIndex
CREATE INDEX "CustomerMemory_updatedAt_idx" ON "CustomerMemory"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIProvider_name_key" ON "AIProvider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AIProvider_slug_key" ON "AIProvider"("slug");

-- CreateIndex
CREATE INDEX "AIProvider_createdAt_idx" ON "AIProvider"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIModel_slug_key" ON "AIModel"("slug");

-- CreateIndex
CREATE INDEX "AIModel_providerId_idx" ON "AIModel"("providerId");

-- CreateIndex
CREATE INDEX "AIModel_active_idx" ON "AIModel"("active");

-- CreateIndex
CREATE INDEX "AIModel_createdAt_idx" ON "AIModel"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIService_slug_key" ON "AIService"("slug");

-- CreateIndex
CREATE INDEX "AIService_type_idx" ON "AIService"("type");

-- CreateIndex
CREATE INDEX "AIService_modelId_idx" ON "AIService"("modelId");

-- CreateIndex
CREATE INDEX "AIService_active_sortOrder_idx" ON "AIService"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "AIService_createdAt_idx" ON "AIService"("createdAt");

-- CreateIndex
CREATE INDEX "UserSelectedService_userId_idx" ON "UserSelectedService"("userId");

-- CreateIndex
CREATE INDEX "UserSelectedService_serviceId_idx" ON "UserSelectedService"("serviceId");

-- CreateIndex
CREATE INDEX "UserSelectedService_userId_createdAt_idx" ON "UserSelectedService"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserSelectedService_createdAt_idx" ON "UserSelectedService"("createdAt");

-- CreateIndex
CREATE INDEX "TokenUsage_userId_idx" ON "TokenUsage"("userId");

-- CreateIndex
CREATE INDEX "TokenUsage_serviceId_idx" ON "TokenUsage"("serviceId");

-- CreateIndex
CREATE INDEX "TokenUsage_userId_createdAt_idx" ON "TokenUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenUsage_createdAt_idx" ON "TokenUsage"("createdAt");

-- CreateIndex
CREATE INDEX "TokenTransaction_userId_createdAt_idx" ON "TokenTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenTransaction_status_idx" ON "TokenTransaction"("status");

-- CreateIndex
CREATE INDEX "TokenTransaction_serviceId_idx" ON "TokenTransaction"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenPackage_key_key" ON "TokenPackage"("key");

-- CreateIndex
CREATE INDEX "TokenPackage_active_sortOrder_idx" ON "TokenPackage"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "TokenPackage_createdAt_idx" ON "TokenPackage"("createdAt");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_packageId_idx" ON "Order"("packageId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");

-- CreateIndex
CREATE INDEX "Conversation_serviceId_idx" ON "Conversation"("serviceId");

-- CreateIndex
CREATE INDEX "Conversation_userId_createdAt_idx" ON "Conversation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesKnowledge_category_idx" ON "SalesKnowledge"("category");

-- CreateIndex
CREATE INDEX "SalesKnowledge_updatedAt_idx" ON "SalesKnowledge"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelCapability_serviceType_key" ON "ModelCapability"("serviceType");

-- CreateIndex
CREATE INDEX "ModelCapability_sortOrder_idx" ON "ModelCapability"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorKnowledge_slug_key" ON "CompetitorKnowledge"("slug");

-- CreateIndex
CREATE INDEX "CompetitorKnowledge_name_idx" ON "CompetitorKnowledge"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ModelConfig_serviceType_key" ON "ModelConfig"("serviceType");

-- CreateIndex
CREATE INDEX "ModelConfig_grade_idx" ON "ModelConfig"("grade");

-- CreateIndex
CREATE INDEX "ModelConfig_sortOrder_idx" ON "ModelConfig"("sortOrder");

-- CreateIndex
CREATE INDEX "SalesConversion_userId_createdAt_idx" ON "SalesConversion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesConversion_packageId_idx" ON "SalesConversion"("packageId");

-- CreateIndex
CREATE INDEX "SalesConversion_status_idx" ON "SalesConversion"("status");

-- CreateIndex
CREATE INDEX "SalesConversion_conversationId_idx" ON "SalesConversion"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesStrategy_code_key" ON "SalesStrategy"("code");

-- CreateIndex
CREATE INDEX "SalesStrategy_intent_idx" ON "SalesStrategy"("intent");

-- CreateIndex
CREATE INDEX "SalesStrategy_priority_idx" ON "SalesStrategy"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_code_key" ON "CustomerProfile"("code");

-- CreateIndex
CREATE INDEX "CustomerProfile_sortOrder_idx" ON "CustomerProfile"("sortOrder");

-- CreateIndex
CREATE INDEX "ModelRecommendRule_priority_idx" ON "ModelRecommendRule"("priority");

-- CreateIndex
CREATE INDEX "ModelRecommendRule_active_idx" ON "ModelRecommendRule"("active");

-- CreateIndex
CREATE INDEX "AgentTrace_createdAt_idx" ON "AgentTrace"("createdAt");

-- CreateIndex
CREATE INDEX "AgentTrace_serviceType_createdAt_idx" ON "AgentTrace"("serviceType", "createdAt");

-- CreateIndex
CREATE INDEX "AgentTrace_status_idx" ON "AgentTrace"("status");

-- CreateIndex
CREATE INDEX "AgentTrace_userId_createdAt_idx" ON "AgentTrace"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_userId_createdAt_idx" ON "ToolCallLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_traceId_idx" ON "ToolCallLog"("traceId");

-- CreateIndex
CREATE INDEX "ToolCallLog_toolName_createdAt_idx" ON "ToolCallLog"("toolName", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_success_idx" ON "ToolCallLog"("success");

-- CreateIndex
CREATE INDEX "ChatAnalytics_userId_createdAt_idx" ON "ChatAnalytics"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAnalytics_intent_idx" ON "ChatAnalytics"("intent");

-- CreateIndex
CREATE INDEX "ConversionAnalytics_packageId_createdAt_idx" ON "ConversionAnalytics"("packageId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversionAnalytics_action_idx" ON "ConversionAnalytics"("action");

-- CreateIndex
CREATE INDEX "SalesFunnelLog_userId_createdAt_idx" ON "SalesFunnelLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesFunnelLog_packageId_idx" ON "SalesFunnelLog"("packageId");

-- CreateIndex
CREATE INDEX "SalesFunnelLog_shown_clicked_paid_idx" ON "SalesFunnelLog"("shown", "clicked", "paid");

-- CreateIndex
CREATE INDEX "AgentErrorLog_type_createdAt_idx" ON "AgentErrorLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AgentErrorLog_traceId_idx" ON "AgentErrorLog"("traceId");

-- CreateIndex
CREATE INDEX "AgentErrorLog_createdAt_idx" ON "AgentErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "AgentLog_userId_createdAt_idx" ON "AgentLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentLog_intent_idx" ON "AgentLog"("intent");

-- CreateIndex
CREATE INDEX "AgentLog_purchased_idx" ON "AgentLog"("purchased");

-- CreateIndex
CREATE INDEX "AgentRun_userId_createdAt_idx" ON "AgentRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_serviceType_createdAt_idx" ON "AgentRun"("serviceType", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_success_idx" ON "AgentRun"("success");

-- CreateIndex
CREATE INDEX "AgentRun_requestId_idx" ON "AgentRun"("requestId");

-- CreateIndex
CREATE INDEX "AgentRun_createdAt_idx" ON "AgentRun"("createdAt");

-- CreateIndex
CREATE INDEX "AgentFeedback_agentRunId_idx" ON "AgentFeedback"("agentRunId");

-- CreateIndex
CREATE INDEX "AgentFeedback_createdAt_idx" ON "AgentFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "AgentFeedback_rating_idx" ON "AgentFeedback"("rating");

-- CreateIndex
CREATE INDEX "AgentToolCall_agentRunId_idx" ON "AgentToolCall"("agentRunId");

-- CreateIndex
CREATE INDEX "AgentToolCall_toolName_createdAt_idx" ON "AgentToolCall"("toolName", "createdAt");

-- CreateIndex
CREATE INDEX "AgentToolCall_toolName_idx" ON "AgentToolCall"("toolName");

-- CreateIndex
CREATE INDEX "AgentToolCall_createdAt_idx" ON "AgentToolCall"("createdAt");

-- CreateIndex
CREATE INDEX "AgentToolCall_success_idx" ON "AgentToolCall"("success");

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateLimitWindow" ADD CONSTRAINT "RateLimitWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMemory" ADD CONSTRAINT "CustomerMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModel" ADD CONSTRAINT "AIModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIService" ADD CONSTRAINT "AIService_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AIModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSelectedService" ADD CONSTRAINT "UserSelectedService_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSelectedService" ADD CONSTRAINT "UserSelectedService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "AIService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "AIService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "AIService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TokenPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "AIService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesConversion" ADD CONSTRAINT "SalesConversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesConversion" ADD CONSTRAINT "SalesConversion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesConversion" ADD CONSTRAINT "SalesConversion_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TokenPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFeedback" ADD CONSTRAINT "AgentFeedback_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
