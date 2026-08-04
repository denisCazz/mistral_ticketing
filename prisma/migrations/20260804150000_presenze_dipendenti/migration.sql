-- CreateEnum
CREATE TYPE "TipoPresenza" AS ENUM ('SEDE', 'TRASFERTA', 'MUTUA', 'PERMESSO', 'FERIE', 'FESTIVO');

-- AlterTable
ALTER TABLE "Dipendente" ADD COLUMN IF NOT EXISTS "costoGiornata" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Dipendente" ADD COLUMN IF NOT EXISTS "indennitaTrasferta" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Dipendente" ADD COLUMN IF NOT EXISTS "costoMutua" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Dipendente" ADD COLUMN IF NOT EXISTS "costoPermesso" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Dipendente" ADD COLUMN IF NOT EXISTS "costoFerie" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Dipendente" ADD COLUMN IF NOT EXISTS "costoFestivo" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PresenzaGiorno" (
    "id" TEXT NOT NULL,
    "dipendenteId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "TipoPresenza" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresenzaGiorno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PresenzaGiorno_dipendenteId_data_key" ON "PresenzaGiorno"("dipendenteId", "data");
CREATE INDEX IF NOT EXISTS "PresenzaGiorno_data_idx" ON "PresenzaGiorno"("data");
CREATE INDEX IF NOT EXISTS "PresenzaGiorno_dipendenteId_idx" ON "PresenzaGiorno"("dipendenteId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PresenzaGiorno" ADD CONSTRAINT "PresenzaGiorno_dipendenteId_fkey"
    FOREIGN KEY ("dipendenteId") REFERENCES "Dipendente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
