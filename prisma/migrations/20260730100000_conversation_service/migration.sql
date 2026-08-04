-- AlterTable
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "AIService" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Conversation" ("id", "userId", "createdAt")
SELECT "id", "userId", "createdAt" FROM "Conversation";

DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";

CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");
CREATE INDEX "Conversation_serviceId_idx" ON "Conversation"("serviceId");
CREATE INDEX "Conversation_userId_createdAt_idx" ON "Conversation"("userId", "createdAt");

PRAGMA foreign_keys=ON;
