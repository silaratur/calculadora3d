-- Corrige o custo gravado nas vendas aprovadas a partir de orçamento depois
-- da mudança "Custo real e preço de venda no orçamento": a venda gravava o
-- baseCost do orçamento (soma dos PREÇOS de venda dos produtos) como custo.
-- Custo real = produtos pelo custo do Catálogo (unitCost do snapshot) x qtd
-- + insumos x qtd + extras.
-- Só mexe onde o custo gravado ainda é exatamente o baseCost do orçamento
-- (ou seja, veio desse erro e o orçamento não foi alterado depois da venda);
-- vendas antigas já corretas têm custo = real e ficam iguais.
UPDATE "SalesOrder"
SET "unitCostSnapshot" = (
  SELECT
    COALESCE((SELECT SUM(COALESCE(json_extract(p.value, '$.unitCost'), 0) * COALESCE(json_extract(p.value, '$.quantity'), 1)) FROM json_each(q."snapshotJson", '$.products') p), 0)
  + COALESCE((SELECT SUM(COALESCE(json_extract(s.value, '$.unitCost'), 0) * COALESCE(json_extract(s.value, '$.quantity'), 1)) FROM json_each(q."snapshotJson", '$.supplies') s), 0)
  + COALESCE((SELECT SUM(COALESCE(json_extract(e.value, '$.unitCost'), 0)) FROM json_each(q."snapshotJson", '$.customExtras') e), 0)
  FROM "Quote" q
  WHERE q."id" = "SalesOrder"."quoteId"
)
WHERE "quoteId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Quote" q
    WHERE q."id" = "SalesOrder"."quoteId"
      AND json_valid(q."snapshotJson")
      AND COALESCE(json_array_length(q."snapshotJson", '$.products'), 0) > 0
      AND abs("SalesOrder"."unitCostSnapshot" - q."baseCost") < 0.005
  );
