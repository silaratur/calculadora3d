-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SalesOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "quoteId" TEXT,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "channel" TEXT NOT NULL DEFAULT 'Venda Direta',
    "channelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "unitCostSnapshot" REAL NOT NULL DEFAULT 0,
    "printTimeHours" REAL NOT NULL DEFAULT 0,
    "discountPerUnit" REAL NOT NULL DEFAULT 0,
    "marketplaceFee" REAL NOT NULL DEFAULT 0,
    "shippingCost" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'PIX',
    "dueDate" DATETIME,
    "plannedProductionDate" DATETIME,
    "expectedPaymentDate" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "MarketplaceChannel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SalesOrder" ("channel", "createdAt", "customerId", "dueDate", "id", "notes", "orderNumber", "paidAmount", "paymentStatus", "productName", "quantity", "quoteId", "status", "totalAmount", "updatedAt") SELECT "channel", "createdAt", "customerId", "dueDate", "id", "notes", "orderNumber", "paidAmount", "paymentStatus", "productName", "quantity", "quoteId", "status", "totalAmount", "updatedAt" FROM "SalesOrder";
DROP TABLE "SalesOrder";
ALTER TABLE "new_SalesOrder" RENAME TO "SalesOrder";
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");
CREATE UNIQUE INDEX "SalesOrder_quoteId_key" ON "SalesOrder"("quoteId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
