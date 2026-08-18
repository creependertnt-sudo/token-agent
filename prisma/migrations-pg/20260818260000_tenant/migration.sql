-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Tenant_createdAt_idx" ON "Tenant"("createdAt");

INSERT INTO "Tenant" ("id", "name", "createdAt")
VALUES ('tenant_default', 'Default Tenant', CURRENT_TIMESTAMP);

ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
UPDATE "User" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentMemory" ADD COLUMN "tenantId" TEXT;
UPDATE "AgentMemory" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
CREATE INDEX "AgentMemory_tenantId_idx" ON "AgentMemory"("tenantId");
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerMemory" ADD COLUMN "tenantId" TEXT;
UPDATE "CustomerMemory" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
CREATE INDEX "CustomerMemory_tenantId_idx" ON "CustomerMemory"("tenantId");
ALTER TABLE "CustomerMemory" ADD CONSTRAINT "CustomerMemory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesKnowledge" ADD COLUMN "tenantId" TEXT;
UPDATE "SalesKnowledge" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
CREATE INDEX "SalesKnowledge_tenantId_idx" ON "SalesKnowledge"("tenantId");
ALTER TABLE "SalesKnowledge" ADD CONSTRAINT "SalesKnowledge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompetitorKnowledge" ADD COLUMN "tenantId" TEXT;
UPDATE "CompetitorKnowledge" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
DROP INDEX IF EXISTS "CompetitorKnowledge_slug_key";
CREATE UNIQUE INDEX "CompetitorKnowledge_tenantId_slug_key" ON "CompetitorKnowledge"("tenantId", "slug");
CREATE INDEX "CompetitorKnowledge_tenantId_idx" ON "CompetitorKnowledge"("tenantId");
ALTER TABLE "CompetitorKnowledge" ADD CONSTRAINT "CompetitorKnowledge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentConfig" ADD COLUMN "tenantId" TEXT;
UPDATE "AgentConfig" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
DROP INDEX IF EXISTS "AgentConfig_serviceType_key";
CREATE UNIQUE INDEX "AgentConfig_tenantId_serviceType_key" ON "AgentConfig"("tenantId", "serviceType");
CREATE INDEX "AgentConfig_tenantId_idx" ON "AgentConfig"("tenantId");
ALTER TABLE "AgentConfig" ADD CONSTRAINT "AgentConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
