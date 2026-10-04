-- Peça sob medida dos Orçamentos: gramas por unidade para baixar o estoque do filamento na Produção.
ALTER TABLE "ProductionItem" ADD COLUMN "gramsPerUnit" REAL NOT NULL DEFAULT 0;
