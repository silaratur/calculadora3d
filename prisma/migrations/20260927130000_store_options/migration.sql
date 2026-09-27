-- AlterTable
ALTER TABLE "Product" ADD COLUMN "colors" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN "storeProductionDays" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "PricingSettings" ADD COLUMN "storeQtyDiscounts" TEXT NOT NULL DEFAULT '[]';
