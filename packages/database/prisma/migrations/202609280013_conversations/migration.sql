-- CreateEnum
CREATE TYPE "ConversationActor" AS ENUM ('STAFF', 'DEVICE', 'VISITOR');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "TurnState" AS ENUM ('ANSWERING', 'COMPLETED', 'INTERRUPTED', 'FAILED');

-- CreateEnum
CREATE TYPE "TurnInput" AS ENUM ('TEXT', 'VOICE');

-- CreateTable
CREATE TABLE "AssistantLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "slug" VARCHAR(32) NOT NULL,
    "releaseId" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssistantLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorGrant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "tokenHash" VARCHAR(43) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "turnCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VisitorGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "actorKind" "ConversationActor" NOT NULL,
    "membershipId" UUID,
    "deviceId" UUID,
    "linkId" UUID,
    "grantId" UUID,
    "resumedFromId" UUID,
    "locale" VARCHAR(8) NOT NULL,
    "providerMode" VARCHAR(8) NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "generation" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "idleUntil" TIMESTAMPTZ(3) NOT NULL,
    "endsBy" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "endReason" VARCHAR(32),
    "reservedSeconds" INTEGER NOT NULL DEFAULT 0,
    "settledSeconds" INTEGER,
    "transcriptDeletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "generation" INTEGER NOT NULL,
    "clientMessageId" UUID NOT NULL,
    "retryOfId" UUID,
    "inputKind" "TurnInput" NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "transcript" VARCHAR(2000) NOT NULL,
    "answer" VARCHAR(8000) NOT NULL DEFAULT '',
    "citedEntryIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "state" "TurnState" NOT NULL DEFAULT 'ANSWERING',
    "failureCode" VARCHAR(32),
    "sttMs" INTEGER,
    "firstTextMs" INTEGER,
    "firstAudioMs" INTEGER,
    "totalMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolExecution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "turnId" UUID NOT NULL,
    "callId" VARCHAR(64) NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "arguments" JSONB,
    "status" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(64),
    "result" JSONB,
    "commandId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyUsage" (
    "organisationId" UUID NOT NULL,
    "usageDate" DATE NOT NULL,
    "liveSessions" INTEGER NOT NULL DEFAULT 0,
    "reservedSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyUsage_pkey" PRIMARY KEY ("organisationId","usageDate")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantLink_slug_key" ON "AssistantLink"("slug");

-- CreateIndex
CREATE INDEX "AssistantLink_organisationId_createdAt_idx" ON "AssistantLink"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantLink_releaseId_organisationId_idx" ON "AssistantLink"("releaseId", "organisationId");

-- CreateIndex
CREATE INDEX "AssistantLink_createdByMembershipId_organisationId_idx" ON "AssistantLink"("createdByMembershipId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantLink_id_organisationId_key" ON "AssistantLink"("id", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorGrant_tokenHash_key" ON "VisitorGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "VisitorGrant_linkId_organisationId_idx" ON "VisitorGrant"("linkId", "organisationId");

-- CreateIndex
CREATE INDEX "VisitorGrant_expiresAt_idx" ON "VisitorGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorGrant_id_organisationId_key" ON "VisitorGrant"("id", "organisationId");

-- CreateIndex
CREATE INDEX "ConversationSession_organisationId_startedAt_idx" ON "ConversationSession"("organisationId", "startedAt");

-- CreateIndex
CREATE INDEX "ConversationSession_organisationId_status_idx" ON "ConversationSession"("organisationId", "status");

-- CreateIndex
CREATE INDEX "ConversationSession_status_idleUntil_idx" ON "ConversationSession"("status", "idleUntil");

-- CreateIndex
CREATE INDEX "ConversationSession_releaseId_organisationId_idx" ON "ConversationSession"("releaseId", "organisationId");

-- CreateIndex
CREATE INDEX "ConversationSession_membershipId_organisationId_idx" ON "ConversationSession"("membershipId", "organisationId");

-- CreateIndex
CREATE INDEX "ConversationSession_deviceId_organisationId_startedAt_idx" ON "ConversationSession"("deviceId", "organisationId", "startedAt");

-- CreateIndex
CREATE INDEX "ConversationSession_linkId_organisationId_idx" ON "ConversationSession"("linkId", "organisationId");

-- CreateIndex
CREATE INDEX "ConversationSession_grantId_organisationId_idx" ON "ConversationSession"("grantId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSession_id_organisationId_key" ON "ConversationSession"("id", "organisationId");

-- CreateIndex
CREATE INDEX "ConversationTurn_organisationId_createdAt_idx" ON "ConversationTurn"("organisationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_sessionId_ordinal_key" ON "ConversationTurn"("sessionId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_sessionId_clientMessageId_key" ON "ConversationTurn"("sessionId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_id_sessionId_organisationId_key" ON "ConversationTurn"("id", "sessionId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolExecution_commandId_key" ON "ToolExecution"("commandId");

-- CreateIndex
CREATE INDEX "ToolExecution_sessionId_organisationId_idx" ON "ToolExecution"("sessionId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolExecution_turnId_callId_key" ON "ToolExecution"("turnId", "callId");

-- AddForeignKey
ALTER TABLE "AssistantLink" ADD CONSTRAINT "AssistantLink_releaseId_organisationId_fkey" FOREIGN KEY ("releaseId", "organisationId") REFERENCES "BotRelease"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AssistantLink" ADD CONSTRAINT "AssistantLink_createdByMembershipId_organisationId_fkey" FOREIGN KEY ("createdByMembershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "VisitorGrant" ADD CONSTRAINT "VisitorGrant_linkId_organisationId_fkey" FOREIGN KEY ("linkId", "organisationId") REFERENCES "AssistantLink"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_releaseId_organisationId_fkey" FOREIGN KEY ("releaseId", "organisationId") REFERENCES "BotRelease"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_membershipId_organisationId_fkey" FOREIGN KEY ("membershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_deviceId_organisationId_fkey" FOREIGN KEY ("deviceId", "organisationId") REFERENCES "Device"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_linkId_organisationId_fkey" FOREIGN KEY ("linkId", "organisationId") REFERENCES "AssistantLink"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_grantId_organisationId_fkey" FOREIGN KEY ("grantId", "organisationId") REFERENCES "VisitorGrant"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_sessionId_organisationId_fkey" FOREIGN KEY ("sessionId", "organisationId") REFERENCES "ConversationSession"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_turnId_sessionId_organisationId_fkey" FOREIGN KEY ("turnId", "sessionId", "organisationId") REFERENCES "ConversationTurn"("id", "sessionId", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "DeviceCommand"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DailyUsage" ADD CONSTRAINT "DailyUsage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- Each actor kind names exactly its own actor columns.
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_actor_check" CHECK (
    ("actorKind" = 'STAFF' AND "membershipId" IS NOT NULL AND "deviceId" IS NULL AND "linkId" IS NULL AND "grantId" IS NULL)
    OR ("actorKind" = 'DEVICE' AND "deviceId" IS NOT NULL AND "membershipId" IS NULL AND "linkId" IS NULL AND "grantId" IS NULL)
    OR ("actorKind" = 'VISITOR' AND "linkId" IS NOT NULL AND "grantId" IS NOT NULL AND "membershipId" IS NULL AND "deviceId" IS NULL)
  ),
  ADD CONSTRAINT "ConversationSession_window_check" CHECK ("endsBy" > "startedAt" AND "idleUntil" >= "startedAt" AND ("endedAt" IS NULL) = ("status" = 'ACTIVE')),
  ADD CONSTRAINT "ConversationSession_usage_check" CHECK ("generation" >= 0 AND "reservedSeconds" >= 0 AND ("settledSeconds" IS NULL OR "settledSeconds" BETWEEN 0 AND "reservedSeconds")),
  ADD CONSTRAINT "ConversationSession_mode_check" CHECK ("providerMode" IN ('fixture', 'live') AND "locale" IN ('en-US', 'ne-NP'));
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_order_check" CHECK ("ordinal" > 0 AND "generation" > 0),
  ADD CONSTRAINT "ConversationTurn_locale_check" CHECK ("locale" IN ('en-US', 'ne-NP')),
  ADD CONSTRAINT "ConversationTurn_timing_check" CHECK (
    ("sttMs" IS NULL OR "sttMs" >= 0) AND ("firstTextMs" IS NULL OR "firstTextMs" >= 0)
    AND ("firstAudioMs" IS NULL OR "firstAudioMs" >= 0) AND ("totalMs" IS NULL OR "totalMs" >= 0)
  ),
  ADD CONSTRAINT "ConversationTurn_completion_check" CHECK (("completedAt" IS NULL) = ("state" = 'ANSWERING'));
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_status_check" CHECK ("status" IN ('DONE', 'APPLIED', 'PENDING', 'REJECTED', 'FAILED')),
  ADD CONSTRAINT "ToolExecution_name_check" CHECK ("name" IN ('lookup_knowledge', 'get_event_schedule', 'select_reference', 'show_slide'));
ALTER TABLE "AssistantLink" ADD CONSTRAINT "AssistantLink_revision_check" CHECK ("revision" > 0),
  ADD CONSTRAINT "AssistantLink_slug_check" CHECK ("slug" ~ '^[a-z0-9]{12,32}$');
ALTER TABLE "VisitorGrant" ADD CONSTRAINT "VisitorGrant_usage_check" CHECK ("sessionCount" >= 0 AND "turnCount" >= 0 AND "expiresAt" > "createdAt");
ALTER TABLE "DailyUsage" ADD CONSTRAINT "DailyUsage_counter_check" CHECK ("liveSessions" >= 0 AND "reservedSeconds" >= 0);

-- One open session per device, visitor grant or staff member: admission ends the previous one first.
CREATE UNIQUE INDEX "ConversationSession_active_device_key" ON "ConversationSession"("deviceId") WHERE "status" = 'ACTIVE' AND "deviceId" IS NOT NULL;
CREATE UNIQUE INDEX "ConversationSession_active_grant_key" ON "ConversationSession"("grantId") WHERE "status" = 'ACTIVE' AND "grantId" IS NOT NULL;
CREATE UNIQUE INDEX "ConversationSession_active_member_key" ON "ConversationSession"("membershipId") WHERE "status" = 'ACTIVE' AND "membershipId" IS NOT NULL;

-- An interruption can never be undone by a late request, and an ended session stays ended.
CREATE FUNCTION svara_conversation_forward() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."generation" < OLD."generation" OR (OLD."status" = 'ENDED' AND NEW."status" = 'ACTIVE')
    OR NEW."organisationId" <> OLD."organisationId" OR NEW."releaseId" <> OLD."releaseId" THEN
    RAISE EXCEPTION 'Conversation sessions only move forward' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConversationSession_forward" BEFORE UPDATE ON "ConversationSession" FOR EACH ROW
  EXECUTE FUNCTION svara_conversation_forward();
