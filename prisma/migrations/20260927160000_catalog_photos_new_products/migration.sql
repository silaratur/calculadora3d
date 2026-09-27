-- Fotos de estúdio (Higgsfield, mesma receita das demais) para os produtos criados
-- em produção depois da primeira leva: capa = public/catalogo/<SKU>.webp.
-- B.017: remove a foto extra (era de outro vendedor). B.016: tinha só a falta de foto
-- como motivo de ficar fora da loja, então entra.
UPDATE "Product" SET "imageUrl" = '/catalogo/B.014.webp' WHERE "sku" = 'B.014';
UPDATE "Product" SET "imageUrl" = '/catalogo/B.015.webp' WHERE "sku" = 'B.015';
UPDATE "Product" SET "imageUrl" = '/catalogo/B.016.webp' WHERE "sku" = 'B.016';
UPDATE "Product" SET "imageUrl" = '/catalogo/B.017.webp' WHERE "sku" = 'B.017';
UPDATE "Product" SET "imageUrl" = '/catalogo/B.018.webp' WHERE "sku" = 'B.018';
UPDATE "Product" SET "imageUrl" = '/catalogo/D.019.webp' WHERE "sku" = 'D.019';
UPDATE "Product" SET "imageUrl" = '/catalogo/D.020.webp' WHERE "sku" = 'D.020';
UPDATE "Product" SET "imageUrl" = '/catalogo/D.021.webp' WHERE "sku" = 'D.021';
UPDATE "Product" SET "extraImages" = '[]' WHERE "sku" = 'B.017';
UPDATE "Product" SET "showInStore" = true WHERE "sku" = 'B.016' AND "active" = true;
