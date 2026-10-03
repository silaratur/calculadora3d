-- Reajuste aprovado em 03/10/2026: kits que ficaram de fora do reajuste de 28/09
-- (aumento acima de 20%) sobem para ~30% de margem sobre o custo do rateio por hora.
-- B.001 (R$ 58,90) e D.009 (R$ 74,90) já foram ajustados pelo usuário no Catálogo.
-- Só altera se o preço ainda for o antigo, para não sobrescrever ajuste manual.

-- B.002 Kit Mini Pandas | R$ 43,90 → R$ 61,90 (margem 2% → 30,5%)
UPDATE "Product" SET "price" = 61.90, "profitMargin" = 43.7941, "discountPerUnit" = 0, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.002' AND "price" = 43.90;
-- B.014 Kit 12 Mini Orcas Articuladas | R$ 15,90 → R$ 19,90 (margem 13% → 30,7%)
UPDATE "Product" SET "price" = 19.90, "profitMargin" = 44.2790, "discountPerUnit" = 0, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.014' AND "price" = 15.90;
