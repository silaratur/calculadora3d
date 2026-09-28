-- Cor escolhida no orçamento e o filamento dessa cor, por peça da produção:
-- a peça mostra a cor e a baixa de estoque sai do filamento certo.
ALTER TABLE "ProductionItem" ADD COLUMN "color" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductionItem" ADD COLUMN "materialId" TEXT;
