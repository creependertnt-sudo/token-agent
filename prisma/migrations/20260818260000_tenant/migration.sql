-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Tenant_createdAt_idx" ON "Tenant"("createdAt");

INSERT INTO "Tenant" ("id", "name", "createdAt")
VALUES ('tenant_default', 'Default Tenant', CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
UPDATE "User" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- AlterTable
ALTER TABLE "AgentMemory" ADD COLUMN "tenantId" TEXT;
UPDATE "AgentMemory" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
CREATE INDEX "AgentMemory_tenantId_idx" ON "AgentMemory"("tenantId");

-- AlterTable
ALTER TABLE "CustomerMemory" ADD COLUMN "tenantId" TEXT;
UPDATE "CustomerMemory" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
CREATE INDEX "CustomerMemory_tenantId_idx" ON "CustomerMemory"("tenantId");

-- AlterTable
ALTER TABLE "SalesKnowledge" ADD COLUMN "tenantId" TEXT;
UPDATE "SalesKnowledge" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
CREATE INDEX "SalesKnowledge_tenantId_idx" ON "SalesKnowledge"("tenantId");

-- AlterTable
ALTER TABLE "CompetitorKnowledge" ADD COLUMN "tenantId" TEXT;
UPDATE "CompetitorKnowledge" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
DROP INDEX IF EXISTS "CompetitorKnowledge_slug_key";
CREATE UNIQUE INDEX "CompetitorKnowledge_tenantId_slug_key" ON "CompetitorKnowledge"("tenantId", "slug");
CREATE INDEX "CompetitorKnowledge_tenantId_idx" ON "CompetitorKnowledge"("tenantId");

-- AlterTable
ALTER TABLE "AgentConfig" ADD COLUMN "tenantId" TEXT;
UPDATE "AgentConfig" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
DROP INDEX IF EXISTS "AgentConfig_serviceType_key";
CREATE UNIQUE INDEX "AgentConfig_tenantId_serviceType_key" ON "AgentConfig"("tenantId", "serviceType");
CREATE INDEX "AgentConfig_tenantId_idx" ON "AgentConfig"("tenantId");
