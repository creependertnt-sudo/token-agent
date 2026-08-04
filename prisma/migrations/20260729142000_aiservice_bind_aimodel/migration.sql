-- AlterTable: AIService.modelId → AIModel（SALES 可为空）
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AIService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "tokenCost" INTEGER NOT NULL,
    "modelId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIService_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AIModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_AIService" ("id", "name", "slug", "description", "type", "tokenCost", "active", "sortOrder", "createdAt")
SELECT "id", "name", "slug", "description", "type", "tokenCost", "active", "sortOrder", "createdAt" FROM "AIService";

DROP TABLE "AIService";
ALTER TABLE "new_AIService" RENAME TO "AIService";

CREATE UNIQUE INDEX "AIService_slug_key" ON "AIService"("slug");
CREATE INDEX "AIService_type_idx" ON "AIService"("type");
CREATE INDEX "AIService_modelId_idx" ON "AIService"("modelId");
CREATE INDEX "AIService_active_sortOrder_idx" ON "AIService"("active", "sortOrder");
CREATE INDEX "AIService_createdAt_idx" ON "AIService"("createdAt");

-- Bind tiers to catalog models by slug（SALES 保持 NULL）
UPDATE "AIService"
SET "modelId" = (SELECT "id" FROM "AIModel" WHERE "slug" = 'grok' LIMIT 1)
WHERE "slug" = 'light' OR "type" = 'LIGHT';

UPDATE "AIService"
SET "modelId" = (SELECT "id" FROM "AIModel" WHERE "slug" = 'claude-sonnet' LIMIT 1)
WHERE "slug" = 'standard' OR "type" = 'STANDARD';

UPDATE "AIService"
SET "modelId" = (SELECT "id" FROM "AIModel" WHERE "slug" = 'gpt-4.1' LIMIT 1)
WHERE "slug" = 'premium' OR "type" = 'PREMIUM';

UPDATE "AIService"
SET "modelId" = NULL
WHERE "slug" = 'sales' OR "type" = 'SALES';

PRAGMA foreign_keys=ON;
