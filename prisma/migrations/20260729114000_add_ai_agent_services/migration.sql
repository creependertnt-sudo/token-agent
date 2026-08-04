-- CreateTable
CREATE TABLE "AIService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "tokenCost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserSelectedService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSelectedService_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSelectedService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "AIService" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenUsage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "AIService" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AIService_slug_key" ON "AIService"("slug");

-- CreateIndex
CREATE INDEX "AIService_type_idx" ON "AIService"("type");

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

-- Seed default AI services (stable ids for reference)
INSERT INTO "AIService" ("id", "name", "slug", "description", "type", "tokenCost", "active", "sortOrder") VALUES
('svc_sales', 'Token销售客服', 'sales', 'Token 销售客服，售前咨询免费', 'SALES', 0, true, 1),
('svc_light', 'A模型AI', 'light', '快速思考，适合简单任务，低消耗', 'LIGHT', 5, true, 2),
('svc_standard', 'B模型AI', 'standard', '中等能力，适合综合任务，中等消耗', 'STANDARD', 20, true, 3),
('svc_premium', 'C模型AI', 'premium', '最高能力，适合复杂任务，高消耗', 'PREMIUM', 50, true, 4);
