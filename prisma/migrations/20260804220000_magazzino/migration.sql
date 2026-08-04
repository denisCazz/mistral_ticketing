-- CreateEnum
CREATE TYPE "TipoMovimentoMagazzino" AS ENUM ('ENTRATA', 'USCITA', 'RETTIFICA');

-- CreateTable
CREATE TABLE "Articolo" (
    "id" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "ean" TEXT,
    "nome" TEXT NOT NULL,
    "descrizione" TEXT,
    "unitaMisura" TEXT NOT NULL DEFAULT 'pz',
    "quantita" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "sogliaMinima" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "ubicazione" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Articolo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoMagazzino" (
    "id" TEXT NOT NULL,
    "articoloId" TEXT NOT NULL,
    "tipo" "TipoMovimentoMagazzino" NOT NULL,
    "quantita" DECIMAL(12,3) NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoMagazzino_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Articolo_codice_key" ON "Articolo"("codice");

-- CreateIndex
CREATE UNIQUE INDEX "Articolo_ean_key" ON "Articolo"("ean");

-- CreateIndex
CREATE INDEX "Articolo_nome_idx" ON "Articolo"("nome");

-- CreateIndex
CREATE INDEX "Articolo_attivo_idx" ON "Articolo"("attivo");

-- CreateIndex
CREATE INDEX "MovimentoMagazzino_articoloId_idx" ON "MovimentoMagazzino"("articoloId");

-- CreateIndex
CREATE INDEX "MovimentoMagazzino_userId_idx" ON "MovimentoMagazzino"("userId");

-- CreateIndex
CREATE INDEX "MovimentoMagazzino_createdAt_idx" ON "MovimentoMagazzino"("createdAt");

-- CreateIndex
CREATE INDEX "MovimentoMagazzino_tipo_idx" ON "MovimentoMagazzino"("tipo");

-- AddForeignKey
ALTER TABLE "MovimentoMagazzino" ADD CONSTRAINT "MovimentoMagazzino_articoloId_fkey" FOREIGN KEY ("articoloId") REFERENCES "Articolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoMagazzino" ADD CONSTRAINT "MovimentoMagazzino_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
