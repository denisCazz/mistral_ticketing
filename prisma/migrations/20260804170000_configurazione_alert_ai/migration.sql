-- Alert email settings on AziendaSettings
ALTER TABLE "AziendaSettings" ADD COLUMN IF NOT EXISTS "alertEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AziendaSettings" ADD COLUMN IF NOT EXISTS "alertIncludiAdmin" BOOLEAN NOT NULL DEFAULT true;

-- Token / cost tracking on AiGenerationAudit
ALTER TABLE "AiGenerationAudit" ADD COLUMN IF NOT EXISTS "promptTokens" INTEGER;
ALTER TABLE "AiGenerationAudit" ADD COLUMN IF NOT EXISTS "completionTokens" INTEGER;
ALTER TABLE "AiGenerationAudit" ADD COLUMN IF NOT EXISTS "embeddingTokens" INTEGER;
ALTER TABLE "AiGenerationAudit" ADD COLUMN IF NOT EXISTS "totalTokens" INTEGER;
ALTER TABLE "AiGenerationAudit" ADD COLUMN IF NOT EXISTS "estimatedCostUsd" DECIMAL(12,6);

CREATE INDEX IF NOT EXISTS "AiGenerationAudit_createdAt_idx" ON "AiGenerationAudit"("createdAt");
