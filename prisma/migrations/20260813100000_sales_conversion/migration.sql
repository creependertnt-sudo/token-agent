-- CreateTable
CREATE TABLE "SalesConversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "packageId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesConversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesConversion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesConversion_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TokenPackage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SalesConversion_userId_createdAt_idx" ON "SalesConversion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesConversion_packageId_idx" ON "SalesConversion"("packageId");

-- CreateIndex
CREATE INDEX "SalesConversion_status_idx" ON "SalesConversion"("status");

-- CreateIndex
CREATE INDEX "SalesConversion_conversationId_idx" ON "SalesConversion"("conversationId");
