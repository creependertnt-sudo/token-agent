-- CreateTable
CREATE TABLE "ModelCapability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenCost" INTEGER NOT NULL,
    "positioning" TEXT NOT NULL,
    "suitableFor" TEXT NOT NULL,
    "notSuitableFor" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelCapability_serviceType_key" ON "ModelCapability"("serviceType");

-- CreateIndex
CREATE INDEX "ModelCapability_sortOrder_idx" ON "ModelCapability"("sortOrder");

-- CreateTable
CREATE TABLE "CompetitorKnowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" TEXT NOT NULL,
    "differences" TEXT NOT NULL,
    "talkTrack" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorKnowledge_slug_key" ON "CompetitorKnowledge"("slug");

-- CreateIndex
CREATE INDEX "CompetitorKnowledge_name_idx" ON "CompetitorKnowledge"("name");
