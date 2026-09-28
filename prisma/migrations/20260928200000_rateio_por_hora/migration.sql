-- Rateio do custo fixo por hora de impressão (aprovado em 28/09/2026):
-- custo fixo do mês ÷ horas produtivas (350 h/mês); cada peça paga pelo tempo que ocupa a impressora.
ALTER TABLE "PricingSettings" ADD COLUMN "monthlyProductiveHours" REAL NOT NULL DEFAULT 350;

-- A energia das impressoras já entra no custo de cada peça (potência × tempo × kWh);
-- mantê-la também nos custos fixos contava duas vezes.
UPDATE "FixedCostMonth" SET "energy" = 0, "updatedAt" = CURRENT_TIMESTAMP WHERE "energy" <> 0;
