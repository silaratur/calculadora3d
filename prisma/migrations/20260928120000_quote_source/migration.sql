-- Origem do orçamento: manual, loja (sacola) ou loja-encomenda (festas e empresas).
ALTER TABLE "Quote" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Quote" ADD COLUMN "sourceDetail" TEXT NOT NULL DEFAULT '';

-- Pedidos da loja feitos antes da coluna existir (a origem estava só no snapshot).
UPDATE "Quote" SET "source" = 'loja-encomenda' WHERE "snapshotJson" LIKE '%"origin":"loja-encomenda"%';
UPDATE "Quote" SET "source" = 'loja' WHERE "snapshotJson" LIKE '%"origin":"loja"%';
