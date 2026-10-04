-- Loja → Promoções: cupons em tabela própria, promoção por produto (% com
-- período) e tamanhos com preço próprio. Só acrescenta: nada existente muda.

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" REAL NOT NULL,
    "minOrder" REAL NOT NULL DEFAULT 0,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "sizeOptions" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Product" ADD COLUMN "promoPercent" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "promoLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "promoStartsAt" DATETIME;
ALTER TABLE "Product" ADD COLUMN "promoEndsAt" DATETIME;

-- O cupom único de Configurações (se houver) vira o primeiro cupom da tabela.
INSERT INTO "Coupon" ("id", "code", "kind", "value", "notes")
SELECT 'cupom-primeira-compra', UPPER(TRIM("storeCouponCode")), 'PERCENT', "storeCouponPercent", 'Cupom de primeira compra (veio das Configurações)'
FROM "PricingSettings"
WHERE "id" = 'default' AND TRIM("storeCouponCode") <> '' AND "storeCouponPercent" > 0;

-- Árvore de Natal (D.026): dois tamanhos aprovados em 04/10/2026.
UPDATE "Product" SET "sizeOptions" = '[{"name":"Pequena · 15 cm","price":37.9},{"name":"Grande · 20 cm","price":44.9}]'
WHERE "sku" = 'D.026' AND "sizeOptions" = '[]';
