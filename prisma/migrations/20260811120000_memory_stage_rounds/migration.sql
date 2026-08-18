-- AlterTable CustomerMemory
ALTER TABLE "CustomerMemory" ADD COLUMN "painPoints" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CustomerMemory" ADD COLUMN "customerStage" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "CustomerMemory" ADD COLUMN "confidence" TEXT NOT NULL DEFAULT 'low';
ALTER TABLE "CustomerMemory" ADD COLUMN "lastIntent" TEXT NOT NULL DEFAULT '';

CREATE INDEX "CustomerMemory_customerStage_idx" ON "CustomerMemory"("customerStage");

-- AlterTable ModelConfig
ALTER TABLE "ModelConfig" ADD COLUMN "memoryRounds" INTEGER NOT NULL DEFAULT 16;
