-- CreateTable
CREATE TABLE "AgentTrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "conversationId" TEXT,
    "serviceType" TEXT NOT NULL,
    "intent" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "latency" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ToolCallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "arguments" TEXT,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "latency" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SalesFunnelLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "packageId" TEXT,
    "strategy" TEXT,
    "shown" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentErrorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "traceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AgentTrace_createdAt_idx" ON "AgentTrace"("createdAt");

-- CreateIndex
CREATE INDEX "AgentTrace_serviceType_createdAt_idx" ON "AgentTrace"("serviceType", "createdAt");

-- CreateIndex
CREATE INDEX "AgentTrace_status_idx" ON "AgentTrace"("status");

-- CreateIndex
CREATE INDEX "AgentTrace_userId_createdAt_idx" ON "AgentTrace"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_traceId_idx" ON "ToolCallLog"("traceId");

-- CreateIndex
CREATE INDEX "ToolCallLog_toolName_createdAt_idx" ON "ToolCallLog"("toolName", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_success_idx" ON "ToolCallLog"("success");

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
