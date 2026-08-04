-- CreateTable
CREATE TABLE "SalesKnowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SalesKnowledge_category_idx" ON "SalesKnowledge"("category");

-- CreateIndex
CREATE INDEX "SalesKnowledge_updatedAt_idx" ON "SalesKnowledge"("updatedAt");
