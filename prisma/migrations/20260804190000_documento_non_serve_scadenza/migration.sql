-- AlterTable
ALTER TABLE "Documento" ADD COLUMN "nonServeScadenza" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Documento_nonServeScadenza_idx" ON "Documento"("nonServeScadenza");
