-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "deliveredAt" DATETIME;

-- CreateTable
CREATE TABLE "QuoteRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "baseCost" REAL NOT NULL,
    "finalPrice" REAL NOT NULL,
    "margin" REAL NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevision_quoteId_number_key" ON "QuoteRevision"("quoteId", "number");
