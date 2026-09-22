-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL DEFAULT '',
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "customerEmail" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "baseCost" REAL NOT NULL,
    "finalPrice" REAL NOT NULL,
    "margin" REAL NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "code" TEXT,
    "validUntil" DATETIME,
    "archiveReason" TEXT DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Quote" ("archiveReason", "baseCost", "code", "createdAt", "customerName", "finalPrice", "id", "margin", "notes", "productId", "productName", "snapshotJson", "status", "updatedAt", "validUntil") SELECT "archiveReason", "baseCost", "code", "createdAt", "customerName", "finalPrice", "id", "margin", "notes", "productId", "productName", "snapshotJson", "status", "updatedAt", "validUntil" FROM "Quote";
DROP TABLE "Quote";
ALTER TABLE "new_Quote" RENAME TO "Quote";
CREATE UNIQUE INDEX "Quote_code_key" ON "Quote"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
