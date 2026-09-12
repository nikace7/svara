CREATE TYPE "SlideTarget" AS ENUM ('PRIMARY', 'SECONDARY', 'BOTH');
CREATE TABLE "Presentation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisationId" UUID NOT NULL,
  "botId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Presentation_revision_check" CHECK ("revision" > 0)
);
CREATE UNIQUE INDEX "Presentation_id_organisationId_key" ON "Presentation"("id", "organisationId");
CREATE UNIQUE INDEX "Presentation_id_botId_organisationId_key" ON "Presentation"("id", "botId", "organisationId");
CREATE INDEX "Presentation_organisationId_botId_createdAt_idx" ON "Presentation"("organisationId", "botId", "createdAt");
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_botId_organisationId_fkey"
  FOREIGN KEY ("botId", "organisationId") REFERENCES "Bot"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BotDraft" ADD COLUMN "presentationId" UUID;
CREATE INDEX "BotDraft_presentationId_botId_organisationId_idx" ON "BotDraft"("presentationId", "botId", "organisationId");
ALTER TABLE "BotDraft" ADD CONSTRAINT "BotDraft_presentationId_botId_organisationId_fkey"
  FOREIGN KEY ("presentationId", "botId", "organisationId") REFERENCES "Presentation"("id", "botId", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "MediaAsset_id_organisationId_state_key" ON "MediaAsset"("id", "organisationId", "state");
CREATE TABLE "Slide" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisationId" UUID NOT NULL,
  "presentationId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "titleEn" VARCHAR(160) NOT NULL DEFAULT '',
  "titleNe" VARCHAR(160) NOT NULL DEFAULT '',
  "bodyEn" VARCHAR(2000) NOT NULL DEFAULT '',
  "bodyNe" VARCHAR(2000) NOT NULL DEFAULT '',
  "mediaId" UUID,
  "mediaState" "MediaState",
  "target" "SlideTarget" NOT NULL DEFAULT 'BOTH',
  "durationSeconds" INTEGER NOT NULL DEFAULT 10,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Slide_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Slide_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "Slide_position_check" CHECK ("position" >= 0 AND "position" < 50),
  CONSTRAINT "Slide_duration_check" CHECK ("durationSeconds" >= 1 AND "durationSeconds" <= 600),
  CONSTRAINT "Slide_ready_reference_check" CHECK (
    ("mediaId" IS NULL AND "mediaState" IS NULL) OR
    ("mediaId" IS NOT NULL AND "mediaState" IS NOT NULL AND "mediaState" = 'READY')
  ),
  -- Reorder defers this constraint within its transaction, then commits one complete order.
  CONSTRAINT "Slide_presentationId_position_key" UNIQUE ("presentationId", "position") DEFERRABLE INITIALLY IMMEDIATE
);
CREATE UNIQUE INDEX "Slide_id_organisationId_key" ON "Slide"("id", "organisationId");
CREATE INDEX "Slide_organisationId_presentationId_idx" ON "Slide"("organisationId", "presentationId");
CREATE INDEX "Slide_mediaId_organisationId_mediaState_idx" ON "Slide"("mediaId", "organisationId", "mediaState");
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_presentationId_organisationId_fkey"
  FOREIGN KEY ("presentationId", "organisationId") REFERENCES "Presentation"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;
-- The fixed READY discriminator prevents both attaching unready media and transitioning
-- referenced media to DELETING, including direct writes and concurrent transactions.
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_mediaId_organisationId_mediaState_fkey"
  FOREIGN KEY ("mediaId", "organisationId", "mediaState") REFERENCES "MediaAsset"("id", "organisationId", "state") ON DELETE RESTRICT ON UPDATE RESTRICT;
