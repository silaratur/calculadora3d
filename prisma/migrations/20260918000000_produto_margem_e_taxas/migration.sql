-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "material" TEXT NOT NULL,
    "weightGrams" REAL NOT NULL,
    "volumeCm3" REAL NOT NULL DEFAULT 0,
    "printTimeHours" REAL NOT NULL,
    "materialCost" REAL NOT NULL,
    "laborCost" REAL NOT NULL,
    "overheadCost" REAL NOT NULL,
    "profitMargin" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "price" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "prepMinutes" REAL NOT NULL DEFAULT 0,
    "cleanupMinutes" REAL NOT NULL DEFAULT 0,
    "energyCost" REAL NOT NULL DEFAULT 0,
    "machineCost" REAL NOT NULL DEFAULT 0,
    "printerId" TEXT,
    "lossRatePercent" REAL NOT NULL DEFAULT 0,
    "pricingMethod" TEXT NOT NULL DEFAULT 'markup',
    "discountPerUnit" REAL NOT NULL DEFAULT 0,
    "marketplaceChannelId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_marketplaceChannelId_fkey" FOREIGN KEY ("marketplaceChannelId") REFERENCES "MarketplaceChannel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "category", "cleanupMinutes", "cost", "createdAt", "description", "energyCost", "id", "imageUrl", "laborCost", "machineCost", "material", "materialCost", "name", "overheadCost", "prepMinutes", "price", "printTimeHours", "printerId", "profitMargin", "sku", "updatedAt", "volumeCm3", "weightGrams") SELECT "active", "category", "cleanupMinutes", "cost", "createdAt", "description", "energyCost", "id", "imageUrl", "laborCost", "machineCost", "material", "materialCost", "name", "overheadCost", "prepMinutes", "price", "printTimeHours", "printerId", "profitMargin", "sku", "updatedAt", "volumeCm3", "weightGrams" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

