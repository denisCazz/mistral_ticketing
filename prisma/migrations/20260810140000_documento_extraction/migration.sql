-- AlterEnum: fonte estrazione AI strutturata
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'FonteScadenza' AND e.enumlabel = 'AI'
  ) THEN
    ALTER TYPE "FonteScadenza" ADD VALUE 'AI';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Documento" ADD COLUMN IF NOT EXISTS "extractionJson" JSONB;
ALTER TABLE "Documento" ADD COLUMN IF NOT EXISTS "extractionAt" TIMESTAMP(3);
