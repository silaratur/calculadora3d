-- Revisão de marca dos produtos do Catálogo (fotos e texto próprios) e link de origem do modelo.
ALTER TABLE "Product" ADD COLUMN "brandReview" TEXT NOT NULL DEFAULT 'DONE';
ALTER TABLE "Product" ADD COLUMN "brandReviewDoc" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "sourceUrl" TEXT NOT NULL DEFAULT '';
