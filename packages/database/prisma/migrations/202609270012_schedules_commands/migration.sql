-- CreateEnum
CREATE TYPE "DeploymentKind" AS ENUM ('SCHEDULED', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "DeviceCommandStatus" AS ENUM ('QUEUED', 'SENT', 'ACKNOWLEDGED', 'FAILED', 'EXPIRED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "venue" VARCHAR(160) NOT NULL DEFAULT '',
    "timezone" VARCHAR(64) NOT NULL,
    "suggestedStartsAt" TIMESTAMPTZ(3),
    "suggestedEndsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "eventId" UUID,
    "kind" "DeploymentKind" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesiredDeviceState" (
    "deviceId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "releaseId" UUID,
    "deploymentId" UUID,
    "appliedRevision" INTEGER NOT NULL DEFAULT 0,
    "appliedReleaseId" UUID,
    "appliedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DesiredDeviceState_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "stateRevision" INTEGER NOT NULL,
    "status" "DeviceCommandStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "acknowledgedAt" TIMESTAMPTZ(3),
    "result" VARCHAR(16),
    "reason" VARCHAR(64),

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_organisationId_archivedAt_name_idx" ON "Event"("organisationId", "archivedAt", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Event_id_organisationId_key" ON "Event"("id", "organisationId");

-- CreateIndex
CREATE INDEX "Deployment_deviceId_organisationId_kind_endsAt_idx" ON "Deployment"("deviceId", "organisationId", "kind", "endsAt");

-- CreateIndex
CREATE INDEX "Deployment_organisationId_startsAt_idx" ON "Deployment"("organisationId", "startsAt");

-- CreateIndex
CREATE INDEX "Deployment_releaseId_organisationId_idx" ON "Deployment"("releaseId", "organisationId");

-- CreateIndex
CREATE INDEX "Deployment_eventId_organisationId_idx" ON "Deployment"("eventId", "organisationId");

-- CreateIndex
CREATE INDEX "Deployment_createdByMembershipId_organisationId_idx" ON "Deployment"("createdByMembershipId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_id_organisationId_key" ON "Deployment"("id", "organisationId");

-- CreateIndex
CREATE INDEX "DesiredDeviceState_deploymentId_organisationId_idx" ON "DesiredDeviceState"("deploymentId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "DesiredDeviceState_deviceId_organisationId_key" ON "DesiredDeviceState"("deviceId", "organisationId");

-- CreateIndex
CREATE INDEX "DeviceCommand_status_nextAttemptAt_idx" ON "DeviceCommand"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_organisationId_createdAt_idx" ON "DeviceCommand"("deviceId", "organisationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_deviceId_organisationId_fkey" FOREIGN KEY ("deviceId", "organisationId") REFERENCES "Device"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_releaseId_organisationId_fkey" FOREIGN KEY ("releaseId", "organisationId") REFERENCES "BotRelease"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_eventId_organisationId_fkey" FOREIGN KEY ("eventId", "organisationId") REFERENCES "Event"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_createdByMembershipId_organisationId_fkey" FOREIGN KEY ("createdByMembershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DesiredDeviceState" ADD CONSTRAINT "DesiredDeviceState_deviceId_organisationId_fkey" FOREIGN KEY ("deviceId", "organisationId") REFERENCES "Device"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DesiredDeviceState" ADD CONSTRAINT "DesiredDeviceState_deploymentId_organisationId_fkey" FOREIGN KEY ("deploymentId", "organisationId") REFERENCES "Deployment"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_organisationId_fkey" FOREIGN KEY ("deviceId", "organisationId") REFERENCES "Device"("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Intervals are [startsAt, endsAt); overrides last at most 24 hours.
ALTER TABLE "Event" ADD CONSTRAINT "Event_revision_check" CHECK ("revision" > 0),
  ADD CONSTRAINT "Event_suggested_window_check" CHECK ("suggestedEndsAt" IS NULL OR "suggestedStartsAt" IS NULL OR "suggestedEndsAt" > "suggestedStartsAt");
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_revision_check" CHECK ("revision" > 0),
  ADD CONSTRAINT "Deployment_window_check" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "Deployment_override_length_check" CHECK ("kind" <> 'OVERRIDE' OR "endsAt" - "startsAt" <= INTERVAL '24 hours');
ALTER TABLE "DesiredDeviceState" ADD CONSTRAINT "DesiredDeviceState_revision_check" CHECK ("revision" > 0 AND "appliedRevision" >= 0 AND "appliedRevision" <= "revision"),
  ADD CONSTRAINT "DesiredDeviceState_governed_check" CHECK ("deploymentId" IS NULL OR "releaseId" IS NOT NULL);
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_revision_check" CHECK ("stateRevision" > 0 AND "attempts" >= 0),
  ADD CONSTRAINT "DeviceCommand_result_check" CHECK ("result" IS NULL OR "result" IN ('APPLIED', 'REJECTED'));

-- An old job or late acknowledgement can never lower a device's desired or applied revision.
CREATE FUNCTION svara_desired_state_forward() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."revision" < OLD."revision" OR NEW."appliedRevision" < OLD."appliedRevision"
    OR NEW."deviceId" <> OLD."deviceId" OR NEW."organisationId" <> OLD."organisationId" THEN
    RAISE EXCEPTION 'Desired device state only moves forward' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DesiredDeviceState_forward" BEFORE UPDATE ON "DesiredDeviceState" FOR EACH ROW
  EXECUTE FUNCTION svara_desired_state_forward();
