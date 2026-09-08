CREATE TYPE "KnowledgeType" AS ENUM ('FAQ', 'NOTE');
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TABLE "KnowledgeEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisationId" UUID NOT NULL,
  "botId" UUID NOT NULL,
  "type" "KnowledgeType" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "contentEn" VARCHAR(8000) NOT NULL DEFAULT '',
  "contentNe" VARCHAR(8000) NOT NULL DEFAULT '',
  "questionEn" VARCHAR(500) NOT NULL DEFAULT '',
  "questionNe" VARCHAR(500) NOT NULL DEFAULT '',
  "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
  "selected" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "approvedAt" TIMESTAMPTZ(3),
  "approvedByMembershipId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeEntry_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "KnowledgeEntry_note_questions_check" CHECK ("type" = 'FAQ' OR ("questionEn" = '' AND "questionNe" = '')),
  CONSTRAINT "KnowledgeEntry_approval_check" CHECK (
    ("status" = 'DRAFT' AND "approvedAt" IS NULL AND "approvedByMembershipId" IS NULL) OR
    ("status" = 'APPROVED' AND "approvedAt" IS NOT NULL AND "approvedByMembershipId" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "KnowledgeEntry_id_organisationId_key" ON "KnowledgeEntry"("id", "organisationId");
CREATE INDEX "KnowledgeEntry_organisationId_botId_status_createdAt_idx" ON "KnowledgeEntry"("organisationId", "botId", "status", "createdAt");
CREATE INDEX "KnowledgeEntry_approvedByMembershipId_idx" ON "KnowledgeEntry"("approvedByMembershipId");
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_botId_organisationId_fkey" FOREIGN KEY ("botId", "organisationId") REFERENCES "Bot"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_approvedByMembershipId_organisationId_fkey" FOREIGN KEY ("approvedByMembershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;
