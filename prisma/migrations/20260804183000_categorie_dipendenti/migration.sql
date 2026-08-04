-- CreateTable
CREATE TABLE IF NOT EXISTS "CategoriaDipendente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "costoGiornata" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "indennitaTrasferta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costoMutua" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costoPermesso" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costoFerie" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costoFestivo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaDipendente_pkey" PRIMARY KEY ("id")
);

-- Copy the existing company defaults to both built-in categories.
INSERT INTO "CategoriaDipendente" (
    "id", "nome", "sistema", "costoGiornata", "indennitaTrasferta",
    "costoMutua", "costoPermesso", "costoFerie", "costoFestivo", "updatedAt"
)
SELECT
    categoria."id", categoria."nome", true, settings."costoGiornata",
    settings."indennitaTrasferta", settings."costoMutua",
    settings."costoPermesso", settings."costoFerie",
    settings."costoFestivo", CURRENT_TIMESTAMP
FROM "AziendaSettings" AS settings
CROSS JOIN (
    VALUES ('manutentore', 'Manutentore'), ('programmatore', 'Programmatore')
) AS categoria("id", "nome")
WHERE settings."id" = 'default';

-- Keep migration safe when settings have not been created yet.
INSERT INTO "CategoriaDipendente" ("id", "nome", "sistema", "updatedAt")
VALUES
    ('manutentore', 'Manutentore', true, CURRENT_TIMESTAMP),
    ('programmatore', 'Programmatore', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- AlterTable
ALTER TABLE "Dipendente"
ADD COLUMN IF NOT EXISTS "categoriaId" TEXT NOT NULL DEFAULT 'manutentore';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CategoriaDipendente_nome_key" ON "CategoriaDipendente"("nome");
CREATE INDEX IF NOT EXISTS "CategoriaDipendente_nome_idx" ON "CategoriaDipendente"("nome");
CREATE INDEX IF NOT EXISTS "Dipendente_categoriaId_idx" ON "Dipendente"("categoriaId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Dipendente_categoriaId_fkey'
    ) THEN
        ALTER TABLE "Dipendente"
        ADD CONSTRAINT "Dipendente_categoriaId_fkey"
        FOREIGN KEY ("categoriaId") REFERENCES "CategoriaDipendente"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
