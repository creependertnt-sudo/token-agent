-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ToolCallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traceId" TEXT NOT NULL DEFAULT '',
    "arguments" TEXT,
    "error" TEXT,
    "latency" INTEGER
);
INSERT INTO "new_ToolCallLog" ("arguments", "createdAt", "error", "id", "latency", "success", "toolName", "traceId", "userId") SELECT "arguments", "createdAt", "error", "id", "latency", "success", "toolName", "traceId", "userId" FROM "ToolCallLog";
DROP TABLE "ToolCallLog";
ALTER TABLE "new_ToolCallLog" RENAME TO "ToolCallLog";
CREATE INDEX "ToolCallLog_userId_createdAt_idx" ON "ToolCallLog"("userId", "createdAt");
CREATE INDEX "ToolCallLog_traceId_idx" ON "ToolCallLog"("traceId");
CREATE INDEX "ToolCallLog_toolName_createdAt_idx" ON "ToolCallLog"("toolName", "createdAt");
CREATE INDEX "ToolCallLog_success_idx" ON "ToolCallLog"("success");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
