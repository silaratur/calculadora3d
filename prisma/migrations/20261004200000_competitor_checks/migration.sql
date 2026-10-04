-- CreateTable
CREATE TABLE "CompetitorCheckRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "unavailable" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "CompetitorPriceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "competitorPriceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "oldPrice" REAL NOT NULL,
    "newPrice" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorPriceCheck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CompetitorCheckRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompetitorPriceCheck_competitorPriceId_fkey" FOREIGN KEY ("competitorPriceId") REFERENCES "CompetitorPrice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (só acrescenta colunas: os anúncios existentes ficam intactos)
ALTER TABLE "CompetitorPrice" ADD COLUMN "lastCheckStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CompetitorPrice" ADD COLUMN "lastCheckAt" DATETIME;

-- CreateIndex
CREATE INDEX "CompetitorPriceCheck_runId_idx" ON "CompetitorPriceCheck"("runId");

