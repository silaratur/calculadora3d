-- Pedidos da loja chegavam sem markup no snapshot e o editor aplicava o markup
-- padrão por cima do preço do Catálogo (15,90 virava 22,26). Grava markup 0 e
-- os descontos da loja (subtotal - total) como abatimento, como a rota faz agora.
UPDATE "Quote"
SET "snapshotJson" = json_set(
  "snapshotJson",
  '$.markup', '0',
  '$.pricingMethod', 'markup',
  '$.discount', replace(printf('%.2f', MAX(0, COALESCE(json_extract("snapshotJson", '$.calculations.subtotal'), 0) - COALESCE(json_extract("snapshotJson", '$.calculations.price'), 0))), '.', ',')
)
WHERE "source" = 'loja' AND json_valid("snapshotJson") AND json_extract("snapshotJson", '$.markup') IS NULL;
