-- Migration: Preventivi AI + Documenti + Scadenze
-- Run after prisma db push or as baseline migration

CREATE EXTENSION IF NOT EXISTS vector;

-- Legacy cleanup
DROP TABLE IF EXISTS "PraticaStoria" CASCADE;
DROP TABLE IF EXISTS "Pratica" CASCADE;
DROP TABLE IF EXISTS "Cat" CASCADE;
ALTER TABLE "Rapportino" DROP COLUMN IF EXISTS "praticaId";
