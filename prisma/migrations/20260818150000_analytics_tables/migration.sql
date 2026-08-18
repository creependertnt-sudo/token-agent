-- AlterTable
ALTER TABLE "ToolCallLog" ADD COLUMN "userId" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ChatAnalytics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ConversionAnalytics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ToolCallLog_userId_createdAt_idx" ON "ToolCallLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAnalytics_userId_createdAt_idx" ON "ChatAnalytics"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAnalytics_intent_idx" ON "ChatAnalytics"("intent");

-- CreateIndex
CREATE INDEX "ConversionAnalytics_packageId_createdAt_idx" ON "ConversionAnalytics"("packageId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversionAnalytics_action_idx" ON "ConversionAnalytics"("action");
