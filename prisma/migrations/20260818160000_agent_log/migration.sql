-- CreateTable
CREATE TABLE "AgentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "intent" TEXT,
    "toolUsed" TEXT,
    "toolSuccess" BOOLEAN,
    "recommendedPackageId" TEXT,
    "pushStrategy" TEXT,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AgentLog_userId_createdAt_idx" ON "AgentLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentLog_intent_idx" ON "AgentLog"("intent");

-- CreateIndex
CREATE INDEX "AgentLog_purchased_idx" ON "AgentLog"("purchased");
