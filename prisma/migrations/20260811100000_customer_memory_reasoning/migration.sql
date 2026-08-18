-- AlterTable
ALTER TABLE "ModelConfig" ADD COLUMN "enableReasoning" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CustomerMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "industry" TEXT NOT NULL DEFAULT '',
    "needs" TEXT NOT NULL DEFAULT '',
    "budget" TEXT NOT NULL DEFAULT '',
    "purchaseHistory" TEXT NOT NULL DEFAULT '',
    "recommendedModel" TEXT NOT NULL DEFAULT '',
    "preferences" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMemory_userId_key" ON "CustomerMemory"("userId");

-- CreateIndex
CREATE INDEX "CustomerMemory_updatedAt_idx" ON "CustomerMemory"("updatedAt");
