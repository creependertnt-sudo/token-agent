-- AlterTable
ALTER TABLE "ModelConfig" ADD COLUMN "systemInstructions" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "SalesStrategy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "customerType" TEXT NOT NULL DEFAULT '*',
    "name" TEXT NOT NULL,
    "guidelines" TEXT NOT NULL,
    "talkTrack" TEXT NOT NULL,
    "forbidden" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "SalesStrategy_code_key" ON "SalesStrategy"("code");
CREATE INDEX "SalesStrategy_intent_idx" ON "SalesStrategy"("intent");
CREATE INDEX "SalesStrategy_priority_idx" ON "SalesStrategy"("priority");

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CustomerProfile_code_key" ON "CustomerProfile"("code");
CREATE INDEX "CustomerProfile_sortOrder_idx" ON "CustomerProfile"("sortOrder");

-- CreateTable
CREATE TABLE "ModelRecommendRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ModelRecommendRule_priority_idx" ON "ModelRecommendRule"("priority");
CREATE INDEX "ModelRecommendRule_active_idx" ON "ModelRecommendRule"("active");
