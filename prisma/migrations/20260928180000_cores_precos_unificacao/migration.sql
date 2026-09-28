-- Decisões de 28/09/2026 (aprovadas pelo usuário):
-- 1c) preço de peças de um filamento com cores = preço atual + diferença de custo do filamento mais caro
--     entre as cores (com o markup do produto), arredondado para o próximo ,90 (B.005, B.013 e D.012 mantidos);
--     custo/filamento gravados com o filamento mais caro e markup ajustado para bater com o preço;
-- 2)  preços com resíduo de ponto flutuante arredondados para centavos;
-- 3)  Rosa removido das peças de PLA (não há PLA Rosa);
-- 4)  variações de cor unificadas no produto principal (variações ficam inativas e fora da loja; orçamentos antigos seguem apontando para elas) e nomes sem a cor.

-- A.001 Suporte para Celular Dobrável e Articulado: custo 4.43→4.90 (PLA Bege Caucasiano), markup 60→81.6327; preço 7.9→8.90
UPDATE "Product" SET "cost" = 4.9, "materialCost" = 1.82784, "profitMargin" = 81.6327, "price" = 8.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'A.001';
-- B.005 Chaveiro Sensorial Hexagonal: custo 2.29→2.44 (PLA Vermelho), markup 100→100.8197
UPDATE "Product" SET "cost" = 2.44, "materialCost" = 0.76518, "profitMargin" = 100.8197, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.005';
-- B.010 Checklist Infantil de Tarefas: cores ["Azul"]
UPDATE "Product" SET "colors" = '["Azul"]', "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.010';
-- B.011 Chaveiro Dinossauro Articulado: custo 4.05→4.42 (PLA Vermelho), markup 50→78.733; preço 6.9→7.90
UPDATE "Product" SET "cost" = 4.42, "materialCost" = 1.9358400000000002, "profitMargin" = 78.733, "price" = 7.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.011';
-- B.012 Chaveiro Unicórnio Articulado: cores ["Branco","Bege Caucasiano"]; custo 5.72→6.49 (PLA Bege Caucasiano), markup 40→67.9507; preço 8.9→10.90
UPDATE "Product" SET "colors" = '["Branco","Bege Caucasiano"]', "cost" = 6.49, "materialCost" = 2.97024, "profitMargin" = 67.9507, "price" = 10.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.012';
-- B.013 Guia de Leitura Infantil: custo 1.80→1.88 (PLA Vermelho), markup 50→54.2553
UPDATE "Product" SET "cost" = 1.88, "materialCost" = 0.436, "profitMargin" = 54.2553, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.013';
-- B.018 Ponteira de Lápis Personalizada com Nome: cores ["Bege","Branco","Azul","Verde","Preto","Marrom"]
UPDATE "Product" SET "colors" = '["Bege","Branco","Azul","Verde","Preto","Marrom"]', "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.018';
-- D.001 Bandeja Decorativa Oval Minimalista: custo 10.25→12.24 (PLA Bege Caucasiano), markup 84.3582→87.0915; preço 18.89999625659022→22.90
UPDATE "Product" SET "cost" = 12.24, "materialCost" = 7.683829999999999, "profitMargin" = 87.0915, "price" = 22.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.001';
-- D.002 Placa Decorativa Feliz Natal Vermelha: cores ["Vermelho","Branco","Bege Caucasiano","Marrom","Verde"]; custo 8.77→9.23 (PLA Bege Caucasiano), markup 72→83.0986; preço 15.9→16.90; nome → Placa Decorativa Feliz Natal
UPDATE "Product" SET "colors" = '["Vermelho","Branco","Bege Caucasiano","Marrom","Verde"]', "cost" = 9.23, "materialCost" = 5.52279, "profitMargin" = 83.0986, "price" = 16.90, "name" = 'Placa Decorativa Feliz Natal', "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.002';
-- D.003 Vasinho Mãozinhas de Coração: custo 8.30→9.60 (PLA Bege Caucasiano), markup 40→44.7917; preço 11.9→13.90
UPDATE "Product" SET "cost" = 9.6, "materialCost" = 4.99681, "profitMargin" = 44.7917, "price" = 13.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.003';
-- D.004 Kit Porta-Copos Canelado com Suporte: custo 27.34→32.77 (PLA Bege Caucasiano), markup 40→43.1187; preço 38.9→46.90
UPDATE "Product" SET "cost" = 32.77, "materialCost" = 19.96939, "profitMargin" = 43.1187, "price" = 46.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.004';
-- D.005 Porta-Joias Redondo com Esferas: custo 12.99→15.29 (PLA Bege Caucasiano), markup 40→49.7711; preço 18.9→22.90
UPDATE "Product" SET "cost" = 15.29, "materialCost" = 8.44662, "profitMargin" = 49.7711, "price" = 22.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.005';
-- D.006 Porta-Joias Oval Canelado: custo 8.22→9.44 (PLA Bege Caucasiano), markup 40→47.2458; preço 11.9→13.90
UPDATE "Product" SET "cost" = 9.44, "materialCost" = 4.50415, "profitMargin" = 47.2458, "price" = 13.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.006';
-- D.007 Saboneteira com Drenagem: custo 12.16→13.65 (PLA Bege Caucasiano), markup 40→53.1136; preço 17.9→20.90
UPDATE "Product" SET "cost" = 13.65, "materialCost" = 6.89248, "profitMargin" = 53.1136, "price" = 20.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.007';
-- D.008 Renas Natalinas Bege: unificado em D.010 (inativo, fora da loja)
UPDATE "Product" SET "active" = false, "showInStore" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.008';
-- D.010 Renas Natalinas Vermelhas: custo 7.27→7.50 (PLA Bege Caucasiano), markup 77.3997→98.6667; preço 13.9→14.90; nome → Renas Natalinas
UPDATE "Product" SET "cost" = 7.5, "materialCost" = 2.5704000000000002, "profitMargin" = 98.6667, "price" = 14.90, "name" = 'Renas Natalinas', "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.010';
-- D.011 Quebra-Nozes Soldadinho Bege: unificado em D.018 (inativo, fora da loja)
UPDATE "Product" SET "active" = false, "showInStore" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.011';
-- D.012 Porta-Guardanapo Árvore de Natal: custo 6.58→6.79 (PLA Bege Caucasiano), markup 51.9334→60.5302
UPDATE "Product" SET "cost" = 6.79, "materialCost" = 2.37286, "profitMargin" = 60.5302, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.012';
-- D.014 Presépio Minimalista Sagrada Família 12 cm: custo 10.67→11.51 (PLA Bege Caucasiano), markup 88→98.9574; preço 20.9→22.90
UPDATE "Product" SET "cost" = 11.51, "materialCost" = 4.92541, "profitMargin" = 98.9574, "price" = 22.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.014';
-- D.016 Renas Natalinas Brancas: unificado em D.010 (inativo, fora da loja)
UPDATE "Product" SET "active" = false, "showInStore" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.016';
-- D.017 Placa Decorativa Feliz Natal Branca: preço 14.90000331642867→14.90; unificado em D.002 (inativo, fora da loja)
UPDATE "Product" SET "price" = 14.90, "active" = false, "showInStore" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.017';
-- D.018 Quebra-Nozes Soldadinho Canelado: custo 19.40→20.25 (PLA Bege Caucasiano), markup 80→87.1605; preço 35.9→37.90
UPDATE "Product" SET "cost" = 20.25, "materialCost" = 10.060260000000001, "profitMargin" = 87.1605, "price" = 37.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.018';
-- D.019 Porta-Guardanapo Árvore de Natal Bege: unificado em D.012 (inativo, fora da loja)
UPDATE "Product" SET "active" = false, "showInStore" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.019';
-- D.020 Porta-Guardanapo Árvore de Natal Branco: unificado em D.012 (inativo, fora da loja)
UPDATE "Product" SET "active" = false, "showInStore" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.020';
-- D.022 Kit Porta velas - medio e pequeno: preço 30.89999454135999→30.90
UPDATE "Product" SET "price" = 30.90, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.022';
-- D.023 Placa Decorativa Feliz Natal Bege: unificado em D.002 (inativo, fora da loja)
UPDATE "Product" SET "active" = false, "showInStore" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.023';
-- D.024 Presépio Minimalista- bege: preço 20.9000035062→20.90; unificado em D.014 (inativo, fora da loja)
UPDATE "Product" SET "price" = 20.90, "active" = false, "showInStore" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.024';
-- D.025 Bandeja Decorativa Oval Minimalista- Bege : preço 18.89999892455555→18.90; unificado em D.001 (inativo, fora da loja)
UPDATE "Product" SET "price" = 18.90, "active" = false, "showInStore" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.025';
