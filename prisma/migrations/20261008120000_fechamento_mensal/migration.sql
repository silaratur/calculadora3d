-- Fechamento mensal: sócios e reserva nas Configurações, sócio no lançamento de
-- caixa e a tabela dos meses fechados. Também corrige os dados (decisões do
-- usuário em 05/10/2026).

ALTER TABLE "PricingSettings" ADD COLUMN "partnersJson" TEXT NOT NULL DEFAULT '[{"name":"Sócio 1","share":50},{"name":"Sócio 2","share":50}]';
ALTER TABLE "PricingSettings" ADD COLUMN "cashReserve" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CashEntry" ADD COLUMN "partner" TEXT NOT NULL DEFAULT '';

CREATE TABLE "MonthClosing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "closedBy" TEXT NOT NULL DEFAULT '',
    "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MonthClosing_month_key" ON "MonthClosing"("month");

-- Custos fixos: eram gravados no dia 1º à meia-noite UTC (= 31 do mês anterior
-- em Brasília) e apareciam um mês antes. Passam para o dia 1º ao meio-dia de
-- Brasília (15h UTC), no mês certo.
UPDATE "CashEntry"
SET "date" = (SELECT strftime('%s', f."month" || '-01 15:00:00') * 1000 FROM "FixedCostMonth" f WHERE f."id" = "CashEntry"."sourceId")
WHERE "sourceType" = 'FIXED_COST' AND EXISTS (SELECT 1 FROM "FixedCostMonth" f WHERE f."id" = "CashEntry"."sourceId");

-- Meses que ainda não chegaram ficam previstos (não descontam do saldo atual).
UPDATE "CashEntry" SET "status" = 'PLANNED'
WHERE "sourceType" = 'FIXED_COST' AND "date" > (strftime('%s', 'now') * 1000);

-- Lançamento manual "Outro" de R$ 725,61 em outubro = retirada dos dois sócios (50/50).
UPDATE "CashEntry" SET "category" = 'Retirada de sócio', "partner" = 'Ambos'
WHERE "sourceType" IS NULL AND "category" = 'Outro' AND "type" = 'OUT' AND ABS("amount" - 725.61) < 0.005;
