-- CreateTable
CREATE TABLE "ModelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceType" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "suitableFor" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "tokenCost" INTEGER NOT NULL,
    "maxContext" INTEGER NOT NULL,
    "keywords" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelConfig_serviceType_key" ON "ModelConfig"("serviceType");

-- CreateIndex
CREATE INDEX "ModelConfig_grade_idx" ON "ModelConfig"("grade");

-- CreateIndex
CREATE INDEX "ModelConfig_sortOrder_idx" ON "ModelConfig"("sortOrder");
