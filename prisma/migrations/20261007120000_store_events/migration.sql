-- Loja → Campanhas: medição própria da loja (visitas, peças vistas, sacola, pedidos).

CREATE TABLE "StoreEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT,
    "campaign" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "value" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "StoreEvent_createdAt_idx" ON "StoreEvent"("createdAt");
CREATE INDEX "StoreEvent_type_createdAt_idx" ON "StoreEvent"("type", "createdAt");
