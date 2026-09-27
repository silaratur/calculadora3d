-- AlterTable
ALTER TABLE "Product" ADD COLUMN "personalizable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN "roundPricesTo90" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PricingSettings" ADD COLUMN "storeFreeShippingMin" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PricingSettings" ADD COLUMN "storeShippingText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PricingSettings" ADD COLUMN "storeCouponCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PricingSettings" ADD COLUMN "storeCouponPercent" REAL NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
