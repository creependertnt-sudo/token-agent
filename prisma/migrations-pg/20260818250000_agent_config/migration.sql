-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfigVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "oldPrompt" TEXT NOT NULL,
    "newPrompt" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,

    CONSTRAINT "AgentConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_serviceType_key" ON "AgentConfig"("serviceType");

-- CreateIndex
CREATE INDEX "AgentConfig_enabled_idx" ON "AgentConfig"("enabled");

-- CreateIndex
CREATE INDEX "AgentConfigVersion_agentId_changedAt_idx" ON "AgentConfigVersion"("agentId", "changedAt");

-- AddForeignKey
ALTER TABLE "AgentConfigVersion" ADD CONSTRAINT "AgentConfigVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
