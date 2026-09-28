-- Correções aprovadas em 28/09/2026 (tela de Clientes sem pedidos/total pago):
-- vendas antigas sem cliente passam a ter cliente; cadastro duplicado "ester" desativado.
-- Só mexe em vendas ainda sem cliente (customerId IS NULL) — rodar de novo não duplica.

-- A) "Ana Paula Silveira" é a cliente "Ana Paula Oliveira Silveira".
UPDATE "SalesOrder" SET "customerId" = (SELECT "id" FROM "Customer" WHERE "name" = 'Ana Paula Oliveira Silveira' AND "active" = true LIMIT 1) WHERE "orderNumber" = 'PED-20260921-0002' AND "customerId" IS NULL;

-- B) Clientes das vendas de 18–21/09 que nunca foram cadastrados ("cliente desde" = data da venda).
INSERT INTO "Customer" ("id", "name", "email", "phone", "notes", "active", "createdAt", "updatedAt")
SELECT 'c2609210001cli', 'Eloisa Fernandes', '', '', 'Cadastrado a partir da venda PED-20260921-0001 (sem telefone/e-mail no orçamento de origem).', true, "createdAt", "createdAt" FROM "SalesOrder" WHERE "orderNumber" = 'PED-20260921-0001' AND "customerId" IS NULL;
UPDATE "SalesOrder" SET "customerId" = 'c2609210001cli' WHERE "orderNumber" = 'PED-20260921-0001' AND "customerId" IS NULL AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'c2609210001cli');

INSERT INTO "Customer" ("id", "name", "email", "phone", "notes", "active", "createdAt", "updatedAt")
SELECT 'c2609210003cli', 'Vanuza', '', '', 'Cadastrado a partir da venda PED-20260921-0003 (sem telefone/e-mail no orçamento de origem).', true, "createdAt", "createdAt" FROM "SalesOrder" WHERE "orderNumber" = 'PED-20260921-0003' AND "customerId" IS NULL;
UPDATE "SalesOrder" SET "customerId" = 'c2609210003cli' WHERE "orderNumber" = 'PED-20260921-0003' AND "customerId" IS NULL AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'c2609210003cli');

INSERT INTO "Customer" ("id", "name", "email", "phone", "notes", "active", "createdAt", "updatedAt")
SELECT 'c2609210004cli', 'Letícia Pereira', '', '', 'Cadastrado a partir da venda PED-20260921-0004 (sem telefone/e-mail no orçamento de origem).', true, "createdAt", "createdAt" FROM "SalesOrder" WHERE "orderNumber" = 'PED-20260921-0004' AND "customerId" IS NULL;
UPDATE "SalesOrder" SET "customerId" = 'c2609210004cli' WHERE "orderNumber" = 'PED-20260921-0004' AND "customerId" IS NULL AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'c2609210004cli');

INSERT INTO "Customer" ("id", "name", "email", "phone", "notes", "active", "createdAt", "updatedAt")
SELECT 'c2609210005cli', 'Junia', '', '', 'Cadastrado a partir da venda PED-20260921-0005 (sem telefone/e-mail no orçamento de origem).', true, "createdAt", "createdAt" FROM "SalesOrder" WHERE "orderNumber" = 'PED-20260921-0005' AND "customerId" IS NULL;
UPDATE "SalesOrder" SET "customerId" = 'c2609210005cli' WHERE "orderNumber" = 'PED-20260921-0005' AND "customerId" IS NULL AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'c2609210005cli');

INSERT INTO "Customer" ("id", "name", "email", "phone", "notes", "active", "createdAt", "updatedAt")
SELECT 'c2609180001cli', 'Rebeca', '', '', 'Cadastrado a partir da venda PED-20260918-0001 (sem telefone/e-mail no orçamento de origem).', true, "createdAt", "createdAt" FROM "SalesOrder" WHERE "orderNumber" = 'PED-20260918-0001' AND "customerId" IS NULL;
UPDATE "SalesOrder" SET "customerId" = 'c2609180001cli' WHERE "orderNumber" = 'PED-20260918-0001' AND "customerId" IS NULL AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'c2609180001cli');

-- C) "ester" é cadastro duplicado de "Ester Correia Azevedor" (mesmo telefone e e-mail, sem vendas).
UPDATE "Customer" SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "name" = 'ester' AND "email" = 'estercorreia@gmail.com' AND NOT EXISTS (SELECT 1 FROM "SalesOrder" WHERE "customerId" = "Customer"."id");
