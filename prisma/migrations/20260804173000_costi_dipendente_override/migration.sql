-- I costi del dipendente sono override opzionali dei costi standard aziendali.
-- Gli zeri introdotti dalla migrazione iniziale rappresentavano valori non configurati.
ALTER TABLE "Dipendente" ALTER COLUMN "costoGiornata" DROP NOT NULL;
ALTER TABLE "Dipendente" ALTER COLUMN "costoGiornata" DROP DEFAULT;
ALTER TABLE "Dipendente" ALTER COLUMN "indennitaTrasferta" DROP NOT NULL;
ALTER TABLE "Dipendente" ALTER COLUMN "indennitaTrasferta" DROP DEFAULT;
ALTER TABLE "Dipendente" ALTER COLUMN "costoMutua" DROP NOT NULL;
ALTER TABLE "Dipendente" ALTER COLUMN "costoMutua" DROP DEFAULT;
ALTER TABLE "Dipendente" ALTER COLUMN "costoPermesso" DROP NOT NULL;
ALTER TABLE "Dipendente" ALTER COLUMN "costoPermesso" DROP DEFAULT;
ALTER TABLE "Dipendente" ALTER COLUMN "costoFerie" DROP NOT NULL;
ALTER TABLE "Dipendente" ALTER COLUMN "costoFerie" DROP DEFAULT;
ALTER TABLE "Dipendente" ALTER COLUMN "costoFestivo" DROP NOT NULL;
ALTER TABLE "Dipendente" ALTER COLUMN "costoFestivo" DROP DEFAULT;

UPDATE "Dipendente"
SET
  "costoGiornata" = NULLIF("costoGiornata", 0),
  "indennitaTrasferta" = NULLIF("indennitaTrasferta", 0),
  "costoMutua" = NULLIF("costoMutua", 0),
  "costoPermesso" = NULLIF("costoPermesso", 0),
  "costoFerie" = NULLIF("costoFerie", 0),
  "costoFestivo" = NULLIF("costoFestivo", 0);
