-- CreateTable
CREATE TABLE "AgentFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRunId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentFeedback_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AgentFeedback_agentRunId_idx" ON "AgentFeedback"("agentRunId");

-- CreateIndex
CREATE INDEX "AgentFeedback_createdAt_idx" ON "AgentFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "AgentFeedback_rating_idx" ON "AgentFeedback"("rating");
