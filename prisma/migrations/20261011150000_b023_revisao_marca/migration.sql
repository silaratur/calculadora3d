-- Sapo articulado (B.023): aplica a revisão de marca aprovada em 11/10/2026.
-- 6 fotos próprias com o selo AC3D (corpo verde, mãos e pés laranja, olhos
-- amarelos; foto 6 com as medidas aproximadas), nome mantendo a quantidade do
-- kit, texto novo no clima do Natal e entrada na loja. Preço não muda (R$ 52,90).
-- Os arquivos vão no deploy em public/catalogo/.
UPDATE "Product" SET
  "name" = '10 Mini Sapos Articulados',
  "imageUrl" = '/catalogo/B.023.webp',
  "extraImages" = '["/catalogo/B.023-2.webp","/catalogo/B.023-3.webp","/catalogo/B.023-4.webp","/catalogo/B.023-5.webp","/catalogo/B.023-6.webp"]',
  "description" = 'Dez sapinhos verdes, cheios de personalidade, para encher a casa de alegria nesta reta final para o Natal. Com o corpo articulado, cada sapinho se mexe e muda de pose, o que ajuda a aliviar a ansiedade e a ocupar as mãos nos momentos de tensão. Eles são impressos em 3D aqui no estúdio, em PLA fosco e resistente, e viram lembrancinhas de Natal criativas para presentear ou pendurar entre os galhos decorados.

Cada kit é feito sob encomenda: quanto antes você pedir, mais tranquila fica a entrega antes do Natal.

Onde eles brilham:
- Enfeite para pendurar na árvore de Natal
- Lembrancinha-chaveiro para o amigo secreto ou para a turma
- Brinquedo sensorial antiestresse para a correria das festas

O kit:
- 10 mini sapos articulados com argola de chaveiro
- Corpo verde, mãos e pés laranja e olhos amarelos
- Medidas aproximadas: de 5 × 3 cm a 7 × 4,5 cm (comprimento × altura)

Não indicado para menores de 3 anos: contém peças pequenas. As cores podem variar levemente conforme a iluminação e a tela.',
  "brandReview" = 'DONE',
  "showInStore" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "sku" = 'B.023';
