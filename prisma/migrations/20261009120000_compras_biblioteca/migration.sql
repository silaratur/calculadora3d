-- Registrar compra pela Biblioteca: valor pago e vínculo com o custo variável.
ALTER TABLE "MaterialPurchase" ADD COLUMN "totalPaid" REAL NOT NULL DEFAULT 0;
ALTER TABLE "MaterialPurchase" ADD COLUMN "variableCostId" TEXT;

-- Nova rubrica de custo variável: Insumos.
ALTER TABLE "VariableCostEntry" ADD COLUMN "supplies" REAL NOT NULL DEFAULT 0;

CREATE TABLE "SupplyPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplyId" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "quantity" REAL NOT NULL,
    "totalPaid" REAL NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "purchaseLink" TEXT NOT NULL DEFAULT '',
    "variableCostId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplyPurchase_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
