-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "code" TEXT;
ALTER TABLE "Quote" ADD COLUMN "validUntil" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PricingSettings" (
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
    "companyName" TEXT NOT NULL DEFAULT 'AC3D',
    "companyContact" TEXT NOT NULL DEFAULT '',
    "quoteValidityDays" INTEGER NOT NULL DEFAULT 7,
    "quoteDeliveryText" TEXT NOT NULL DEFAULT '5 a 10 dias úteis após a confirmação do pagamento, conforme a fila de produção.',
    "quoteWarrantyText" TEXT NOT NULL DEFAULT '30 dias contra defeitos de fabricação a partir da entrega. Não cobre uso inadequado, quedas, exposição a calor excessivo ou desgaste natural da peça.',
    "quotePaymentText" TEXT NOT NULL DEFAULT '50% de sinal para iniciar a produção e 50% na entrega ou retirada.',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PricingSettings" ("defaultLossRate", "defaultMarkup", "defaultPowerWatts", "energyRate", "id", "laborRate", "monthlyMaintenance", "monthlyOtherCosts", "monthlyPieces", "monthlyRent", "monthlySubscriptions", "updatedAt") SELECT "defaultLossRate", "defaultMarkup", "defaultPowerWatts", "energyRate", "id", "laborRate", "monthlyMaintenance", "monthlyOtherCosts", "monthlyPieces", "monthlyRent", "monthlySubscriptions", "updatedAt" FROM "PricingSettings";
DROP TABLE "PricingSettings";
ALTER TABLE "new_PricingSettings" RENAME TO "PricingSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Quote_code_key" ON "Quote"("code");
