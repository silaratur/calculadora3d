-- Mini Jesus sentado (B.009 e kit B.006) mede 8 cm, não 5 cm: corrige as
-- descrições (as fotos com a cota já vão como arquivo no deploy).
UPDATE "Product" SET "description" = REPLACE(REPLACE("description", 'cerca de 5 cm', 'cerca de 8 cm'), 'Cerca de 5 cm', 'Cerca de 8 cm'), "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" IN ('B.009', 'B.006') AND "description" LIKE '%erca de 5 cm%';

-- A 4ª foto do B.009 (terço e vela em nicho de oratório) sai do carrossel:
-- a AC3D é cristã evangélica e as cenas religiosas seguem essa linguagem.
UPDATE "Product" SET "extraImages" = REPLACE("extraImages", ',"/catalogo/B.009-4.webp"', ''), "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.009' AND "extraImages" LIKE '%B.009-4.webp%';
