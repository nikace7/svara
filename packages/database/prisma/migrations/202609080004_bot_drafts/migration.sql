CREATE TABLE "Bot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisationId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(1000) NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Bot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Bot_revision_check" CHECK ("revision" > 0)
);
CREATE UNIQUE INDEX "Bot_id_organisationId_key" ON "Bot"("id", "organisationId");
CREATE INDEX "Bot_organisationId_archivedAt_createdAt_idx" ON "Bot"("organisationId", "archivedAt", "createdAt");
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "BotDraft" (
  "botId" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "config" JSONB NOT NULL,
  CONSTRAINT "BotDraft_pkey" PRIMARY KEY ("botId")
);
ALTER TABLE "BotDraft" ADD CONSTRAINT "BotDraft_botId_organisationId_fkey" FOREIGN KEY ("botId", "organisationId") REFERENCES "Bot"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;
