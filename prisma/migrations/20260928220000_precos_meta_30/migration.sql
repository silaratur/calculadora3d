-- Reajuste aprovado em 28/09/2026 (opção B): produtos abaixo de 30% de margem com o custo do rateio
-- por hora, preço sugerido arredondado para o próximo ,90, SÓ quando o aumento é de até 20%.
-- Os aumentos maiores (kits e peças longas) ficam para revisão dos tempos de impressão.

-- B.003 Chaveiro Silaratur - Alto Relevo | R$ 6,90 → R$ 7,90 (+14%)
UPDATE "Product" SET "price" = 7.90, "profitMargin" = 48.2275, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.003';
-- B.008 Kit 15 Chaveiros Silaratur - Alto Relevo | R$ 33,90 → R$ 34,90 (+3%)
UPDATE "Product" SET "price" = 34.90, "profitMargin" = 45.044, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.008';
-- B.010 Checklist Infantil de Tarefas | R$ 10,90 → R$ 11,90 (+9%)
UPDATE "Product" SET "price" = 11.90, "profitMargin" = 55.5469, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'B.010';
-- D.003 Vasinho Mãozinhas de Coração | R$ 13,90 → R$ 14,90 (+7%)
UPDATE "Product" SET "price" = 14.90, "profitMargin" = 44.1022, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.003';
-- D.005 Porta-Joias Redondo com Esferas | R$ 22,90 → R$ 25,90 (+13%)
UPDATE "Product" SET "price" = 25.90, "profitMargin" = 47.9981, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.005';
-- D.006 Porta-Joias Oval Canelado | R$ 13,90 → R$ 14,90 (+7%)
UPDATE "Product" SET "price" = 14.90, "profitMargin" = 47.2943, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.006';
-- D.007 Saboneteira com Drenagem | R$ 20,90 → R$ 22,90 (+10%)
UPDATE "Product" SET "price" = 22.90, "profitMargin" = 44.3121, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.007';
-- D.015 Túmulo Vazio Ele Vive - Jesus Ressuscitado | R$ 20,90 → R$ 24,90 (+19%)
UPDATE "Product" SET "price" = 24.90, "profitMargin" = 46.069, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.015';
-- D.018 Quebra-Nozes Soldadinho Canelado | R$ 37,90 → R$ 39,90 (+5%)
UPDATE "Product" SET "price" = 39.90, "profitMargin" = 44.8985, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.018';
-- D.022 Kit Porta velas - medio e pequeno | R$ 30,90 → R$ 34,90 (+13%)
UPDATE "Product" SET "price" = 34.90, "profitMargin" = 44.9204, "updatedAt" = CURRENT_TIMESTAMP WHERE "sku" = 'D.022';
