CREATE TABLE "CostoAccessorio" (
    "id" TEXT NOT NULL,
    "dipendenteId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "categoria" TEXT NOT NULL,
    "importo" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostoAccessorio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CostoAccessorio_data_idx" ON "CostoAccessorio"("data");
CREATE INDEX "CostoAccessorio_dipendenteId_data_idx" ON "CostoAccessorio"("dipendenteId", "data");

ALTER TABLE "CostoAccessorio"
ADD CONSTRAINT "CostoAccessorio_dipendenteId_fkey"
FOREIGN KEY ("dipendenteId") REFERENCES "Dipendente"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
