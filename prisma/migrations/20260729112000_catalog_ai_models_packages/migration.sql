-- CreateSchema
-- Create AI catalog tables and rebuild Order to use TokenPackage

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "Order";
DROP TABLE IF EXISTS "TokenProduct";
DROP TABLE IF EXISTS "AIModel";
DROP TABLE IF EXISTS "AIProvider";
DROP TABLE IF EXISTS "TokenPackage";

CREATE TABLE "AIProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "AIProvider_name_key" ON "AIProvider"("name");
CREATE UNIQUE INDEX "AIProvider_slug_key" ON "AIProvider"("slug");
CREATE INDEX "AIProvider_createdAt_idx" ON "AIProvider"("createdAt");

CREATE TABLE "AIModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "contextWindow" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AIModel_slug_key" ON "AIModel"("slug");
CREATE INDEX "AIModel_providerId_idx" ON "AIModel"("providerId");
CREATE INDEX "AIModel_active_idx" ON "AIModel"("active");
CREATE INDEX "AIModel_createdAt_idx" ON "AIModel"("createdAt");

CREATE TABLE "TokenPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenAmount" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "TokenPackage_key_key" ON "TokenPackage"("key");
CREATE INDEX "TokenPackage_active_sortOrder_idx" ON "TokenPackage"("active", "sortOrder");
CREATE INDEX "TokenPackage_createdAt_idx" ON "TokenPackage"("createdAt");

CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "tokenAmount" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TokenPackage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_packageId_idx" ON "Order"("packageId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

PRAGMA foreign_keys=ON;
