-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'PIX',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FixedCostMonth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" TEXT NOT NULL,
    "rent" REAL NOT NULL DEFAULT 0,
    "software" REAL NOT NULL DEFAULT 0,
    "accounting" REAL NOT NULL DEFAULT 0,
    "internet" REAL NOT NULL DEFAULT 0,
    "maintenance" REAL NOT NULL DEFAULT 0,
    "marketing" REAL NOT NULL DEFAULT 0,
    "energy" REAL NOT NULL DEFAULT 0,
    "subscriptions" REAL NOT NULL DEFAULT 0,
    "other" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VariableCostEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "filament" REAL NOT NULL DEFAULT 0,
    "commission" REAL NOT NULL DEFAULT 0,
    "energy" REAL NOT NULL DEFAULT 0,
    "shipping" REAL NOT NULL DEFAULT 0,
    "packaging" REAL NOT NULL DEFAULT 0,
    "waste" REAL NOT NULL DEFAULT 0,
    "salesFee" REAL NOT NULL DEFAULT 0,
    "maintenance" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CashEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'REALIZED',
    "amount" REAL NOT NULL,
    "orderId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedCostMonth_month_key" ON "FixedCostMonth"("month");

-- CreateIndex
CREATE UNIQUE INDEX "CashEntry_sourceType_sourceId_key" ON "CashEntry"("sourceType", "sourceId");
