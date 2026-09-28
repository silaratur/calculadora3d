-- Concorrência: quantidade de peças no anúncio, frete e observação (avaliação por unidade com frete).
ALTER TABLE "CompetitorPrice" ADD COLUMN "quantity" REAL NOT NULL DEFAULT 1;
ALTER TABLE "CompetitorPrice" ADD COLUMN "shipping" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CompetitorPrice" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
