-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PricingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "energyRate" REAL NOT NULL DEFAULT 0.85,
    "defaultPowerWatts" REAL NOT NULL DEFAULT 250,
    "laborRate" REAL NOT NULL DEFAULT 25,
    "monthlyRent" REAL NOT NULL DEFAULT 0,
    "monthlySubscriptions" REAL NOT NULL DEFAULT 50,
    "monthlyMaintenance" REAL NOT NULL DEFAULT 40,
    "monthlyOtherCosts" REAL NOT NULL DEFAULT 0,
    "monthlyPieces" REAL NOT NULL DEFAULT 60,
    "defaultMarkup" REAL NOT NULL DEFAULT 40,
    "defaultLossRate" REAL NOT NULL DEFAULT 5,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MarketplaceChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "commissionRate" REAL NOT NULL DEFAULT 0,
    "fixedFee" REAL NOT NULL DEFAULT 0,
    "adsRate" REAL NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "costPerKg" REAL NOT NULL,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "unitWeightGrams" REAL NOT NULL DEFAULT 1000,
    "stockGrams" REAL NOT NULL DEFAULT 0,
    "purchaseDate" DATETIME,
    "purchaseLink" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "model" TEXT NOT NULL,
    "purchasePrice" REAL NOT NULL,
    "powerWatts" REAL NOT NULL,
    "usefulLifeHours" REAL NOT NULL,
    "maintenancePerHour" REAL NOT NULL,
    "purchaseDate" DATETIME,
    "purchaseLink" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Supply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unitCost" REAL NOT NULL,
    "purchaseDate" DATETIME,
    "purchaseLink" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "material" TEXT NOT NULL,
    "weightGrams" REAL NOT NULL,
    "volumeCm3" REAL NOT NULL,
    "printTimeHours" REAL NOT NULL,
    "materialCost" REAL NOT NULL,
    "laborCost" REAL NOT NULL,
    "overheadCost" REAL NOT NULL,
    "profitMargin" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "price" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MaterialPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialId" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "unitPrice" REAL NOT NULL,
    "weightGrams" REAL NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "purchaseLink" TEXT NOT NULL DEFAULT '',
    "lot" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialPurchase_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "grams" REAL NOT NULL,
    CONSTRAINT "ProductMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductSupply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "ProductSupply_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductSupply_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "baseCost" REAL NOT NULL,
    "finalPrice" REAL NOT NULL,
    "margin" REAL NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "quoteId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "channel" TEXT NOT NULL DEFAULT 'Venda Direta',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "printerName" TEXT NOT NULL DEFAULT '',
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitorPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "competitor" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT '',
    "price" REAL NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceChannel_name_key" ON "MarketplaceChannel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Material_name_key" ON "Material"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_model_key" ON "Printer"("model");

-- CreateIndex
CREATE UNIQUE INDEX "Supply_name_key" ON "Supply"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMaterial_productId_materialId_key" ON "ProductMaterial"("productId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupply_productId_supplyId_key" ON "ProductSupply"("productId", "supplyId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_quoteId_key" ON "SalesOrder"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionJob_orderId_key" ON "ProductionJob"("orderId");

