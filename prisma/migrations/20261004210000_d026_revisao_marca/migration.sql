-- Árvore de Natal (D.026): aplica a revisão de marca aprovada em 04/10/2026.
-- 6 fotos próprias com o selo AC3D (copa sempre verde; base e estrela em Marrom
-- ou Bege; tamanhos com régua e preço), nome e texto novos no clima do Natal, e
-- volta para a loja. Os arquivos vão no deploy em public/catalogo/.
UPDATE "Product" SET
  "name" = 'Árvore de Natal Japandi',
  "imageUrl" = '/catalogo/D.026.webp',
  "extraImages" = '["/catalogo/D.026-2.webp","/catalogo/D.026-3.webp","/catalogo/D.026-4.webp","/catalogo/D.026-5.webp","/catalogo/D.026-6.webp"]',
  "description" = 'O Natal está chegando, e esta arvorezinha coloca a casa no clima da data sem ocupar espaço. A copa verde em camadas caneladas lembra um pinheiro de verdade, num desenho limpo que combina com a decoração japandi. Ela é impressa em 3D aqui no estúdio, em PLA fosco, com base e estrela em marrom ou bege.

Cada árvore é feita sob encomenda: quanto antes você pedir, mais tranquila fica a entrega antes do Natal.

Onde ela brilha:
- Centro da mesa da ceia de Natal
- Aparador, estante ou rack da sala durante dezembro
- Presente de amigo secreto ou lembrança de fim de ano

Tamanhos:
- Pequena: 15 cm de altura × 7,5 cm de diâmetro, R$ 37,90
- Grande: 20 cm de altura × 10 cm de diâmetro, R$ 44,90

Cores: base e estrela em Marrom ou Bege; a copa é sempre verde. Chega em partes que se encaixam em segundos.',
  "brandReview" = 'DONE',
  "showInStore" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "sku" = 'D.026';
