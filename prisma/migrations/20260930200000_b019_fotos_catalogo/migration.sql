-- Kit 4 Mini Macaco Articulado (B.019): troca a foto enviada no cadastro (de
-- outra marca, com marca d'água) pelas 5 fotos próprias do Catálogo com o selo
-- AC3D. Os arquivos vão no deploy em public/catalogo/.
UPDATE "Product" SET "imageUrl" = '/catalogo/B.019.webp', "extraImages" = '["/catalogo/B.019-2.webp","/catalogo/B.019-3.webp","/catalogo/B.019-4.webp","/catalogo/B.019-5.webp"]', "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.019';
