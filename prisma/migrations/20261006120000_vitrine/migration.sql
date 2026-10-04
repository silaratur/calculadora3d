-- Loja → Vitrine: destaque, selo e posição dos produtos; coleções editáveis e
-- banner da abertura. Só acrescenta: nada existente muda.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "storeFeatured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "storeBadge" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "storeOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StoreCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "lead" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT 'vinho',
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "productIds" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StoreBanner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "buttonLabel" TEXT NOT NULL DEFAULT '',
    "target" TEXT NOT NULL DEFAULT '',
    "productId" TEXT,
    "imageIndex" INTEGER NOT NULL DEFAULT 0,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
