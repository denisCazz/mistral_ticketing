-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATORE', 'MANUTENTORE');

-- CreateEnum
CREATE TYPE "StatoPratica" AS ENUM ('RICEVUTA', 'PRESA_IN_CARICO', 'PRESA_IN_CARICO_MANUTENTORE', 'IN_ATTESA_RICAMBI', 'COMPLETATA', 'ANNULLATA', 'NON_RISOLVIBILE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATORE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "indirizzo" TEXT,
    "cap" TEXT,
    "citta" TEXT,
    "provincia" TEXT,
    "telFisso" TEXT,
    "cellulare" TEXT,
    "email" TEXT,
    "note1" TEXT,
    "note2" TEXT,
    "note3" TEXT,
    "statoAnagrafica" TEXT,
    "motivoControllo" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pratica" (
    "id" TEXT NOT NULL,
    "numeroPratica" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipoIntervento" TEXT,
    "descrizione" TEXT,
    "stato" "StatoPratica" NOT NULL DEFAULT 'RICEVUTA',
    "operatoreId" TEXT NOT NULL,
    "manutentoreId" TEXT,
    "noteInterne" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pratica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PraticaStoria" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "statoDa" "StatoPratica",
    "statoA" "StatoPratica" NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "PraticaStoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XlsxDuplicato" (
    "id" TEXT NOT NULL,
    "gruppoId" TEXT NOT NULL,
    "recordJson" JSONB NOT NULL,
    "scelto" BOOLEAN NOT NULL DEFAULT false,
    "risolto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XlsxDuplicato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Cliente_ragioneSociale_idx" ON "Cliente"("ragioneSociale");

-- CreateIndex
CREATE INDEX "Cliente_cellulare_idx" ON "Cliente"("cellulare");

-- CreateIndex
CREATE INDEX "Cliente_email_idx" ON "Cliente"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pratica_numeroPratica_key" ON "Pratica"("numeroPratica");

-- CreateIndex
CREATE INDEX "Pratica_stato_idx" ON "Pratica"("stato");

-- CreateIndex
CREATE INDEX "Pratica_clienteId_idx" ON "Pratica"("clienteId");

-- CreateIndex
CREATE INDEX "Pratica_operatoreId_idx" ON "Pratica"("operatoreId");

-- CreateIndex
CREATE INDEX "Pratica_manutentoreId_idx" ON "Pratica"("manutentoreId");

-- CreateIndex
CREATE INDEX "PraticaStoria_praticaId_idx" ON "PraticaStoria"("praticaId");

-- CreateIndex
CREATE INDEX "XlsxDuplicato_gruppoId_idx" ON "XlsxDuplicato"("gruppoId");

-- CreateIndex
CREATE INDEX "XlsxDuplicato_risolto_idx" ON "XlsxDuplicato"("risolto");

-- AddForeignKey
ALTER TABLE "Pratica" ADD CONSTRAINT "Pratica_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pratica" ADD CONSTRAINT "Pratica_operatoreId_fkey" FOREIGN KEY ("operatoreId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pratica" ADD CONSTRAINT "Pratica_manutentoreId_fkey" FOREIGN KEY ("manutentoreId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraticaStoria" ADD CONSTRAINT "PraticaStoria_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraticaStoria" ADD CONSTRAINT "PraticaStoria_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
