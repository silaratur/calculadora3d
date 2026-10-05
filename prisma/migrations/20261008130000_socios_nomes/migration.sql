-- Sócios da AC3D (informado pelo usuário em 05/10/2026): 50% cada.
UPDATE "PricingSettings" SET "partnersJson" = '[{"name":"Marcelo Silveira","share":50},{"name":"Ana Clara Silveira","share":50}]';

-- A retirada de R$ 725,61 de outubro foi R$ 410,00 do Marcelo e R$ 315,61 da Ana Clara.
INSERT INTO "CashEntry" ("id", "date", "category", "type", "description", "status", "amount", "partner", "createdAt")
SELECT 'ret' || lower(hex(randomblob(10))), "date", "category", "type", "description", "status", 315.61, 'Ana Clara Silveira', "createdAt"
FROM "CashEntry"
WHERE "sourceType" IS NULL AND "category" = 'Retirada de sócio' AND "partner" = 'Ambos' AND ABS("amount" - 725.61) < 0.005;

UPDATE "CashEntry" SET "amount" = 410, "partner" = 'Marcelo Silveira'
WHERE "sourceType" IS NULL AND "category" = 'Retirada de sócio' AND "partner" = 'Ambos' AND ABS("amount" - 725.61) < 0.005;
