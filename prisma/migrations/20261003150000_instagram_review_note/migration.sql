-- Motivo da reprovação na revisão de posts da Divulgação.
ALTER TABLE "InstagramPost" ADD COLUMN "reviewNote" TEXT NOT NULL DEFAULT '';
