CREATE TYPE "DeviceClientRole" AS ENUM ('PRIMARY', 'DISPLAY');

CREATE TABLE "Device" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "name" VARCHAR(120) NOT NULL CHECK (length(btrim("name")) > 0),
  "capabilities" JSONB NOT NULL CHECK ((jsonb_typeof("capabilities") = 'object'
    AND jsonb_typeof("capabilities"->'microphone') = 'boolean'
    AND jsonb_typeof("capabilities"->'speaker') = 'boolean'
    AND jsonb_typeof("capabilities"->'secondaryDisplay') = 'boolean'
    AND "capabilities" - ARRAY['microphone','speaker','secondaryDisplay'] = '{}'::jsonb) IS TRUE),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "lastSeenAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  UNIQUE ("id", "organisationId")
);
CREATE INDEX "Device_organisationId_id_idx" ON "Device" ("organisationId", "id");

CREATE TABLE "PairingChallenge" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceId" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "issuerMembershipId" UUID NOT NULL,
  "codeHash" VARCHAR(43) NOT NULL CHECK ("codeHash" ~ '^[A-Za-z0-9_-]{43}$'),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 5),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "redeemedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "PairingChallenge_scope_key" UNIQUE ("id", "deviceId", "organisationId"),
  FOREIGN KEY ("deviceId", "organisationId") REFERENCES "Device" ("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("issuerMembershipId", "organisationId") REFERENCES "Membership" ("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ("expiresAt" = "createdAt" + INTERVAL '5 minutes'),
  CHECK ("redeemedAt" IS NULL OR ("redeemedAt" >= "createdAt" AND "redeemedAt" < "expiresAt" AND "attempts" < 5)),
  CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);
CREATE INDEX "PairingChallenge_deviceId_organisationId_idx" ON "PairingChallenge" ("deviceId", "organisationId");
CREATE INDEX "PairingChallenge_expiresAt_idx" ON "PairingChallenge" ("expiresAt");
CREATE INDEX "PairingChallenge_issuerMembershipId_organisationId_idx" ON "PairingChallenge" ("issuerMembershipId", "organisationId");

CREATE TABLE "DeviceCredential" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceId" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "challengeId" UUID NOT NULL UNIQUE,
  "tokenHash" VARCHAR(43) NOT NULL UNIQUE CHECK ("tokenHash" ~ '^[A-Za-z0-9_-]{43}$'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "DeviceCredential_scope_key" UNIQUE ("id", "deviceId", "organisationId"),
  CONSTRAINT "DeviceCredential_challenge_scope_key" UNIQUE ("challengeId", "deviceId", "organisationId"),
  FOREIGN KEY ("deviceId", "organisationId") REFERENCES "Device" ("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("challengeId", "deviceId", "organisationId") REFERENCES "PairingChallenge" ("id", "deviceId", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ("lastUsedAt" IS NULL OR "lastUsedAt" >= "createdAt"),
  CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);
CREATE UNIQUE INDEX "DeviceCredential_current_key" ON "DeviceCredential" ("deviceId") WHERE "revokedAt" IS NULL;
CREATE INDEX "DeviceCredential_deviceId_organisationId_revokedAt_idx" ON "DeviceCredential" ("deviceId", "organisationId", "revokedAt");

CREATE TABLE "DeviceTicket" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "credentialId" UUID NOT NULL,
  "deviceId" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "tokenHash" VARCHAR(43) NOT NULL UNIQUE CHECK ("tokenHash" ~ '^[A-Za-z0-9_-]{43}$'),
  "namespace" VARCHAR(16) NOT NULL CHECK ("namespace" = '/devices'),
  "role" "DeviceClientRole" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "DeviceTicket_scope_key" UNIQUE ("id", "credentialId", "deviceId", "organisationId", "role", "namespace"),
  FOREIGN KEY ("credentialId", "deviceId", "organisationId") REFERENCES "DeviceCredential" ("id", "deviceId", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ("expiresAt" = "createdAt" + INTERVAL '60 seconds'),
  CHECK ("consumedAt" IS NULL OR ("consumedAt" >= "createdAt" AND "consumedAt" < "expiresAt")),
  CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);
CREATE INDEX "DeviceTicket_credentialId_role_expiresAt_idx" ON "DeviceTicket" ("credentialId", "role", "expiresAt");
CREATE INDEX "DeviceTicket_deviceId_organisationId_idx" ON "DeviceTicket" ("deviceId", "organisationId");
CREATE INDEX "DeviceTicket_expiresAt_idx" ON "DeviceTicket" ("expiresAt");

CREATE TABLE "DeviceGrant" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" UUID NOT NULL UNIQUE,
  "credentialId" UUID NOT NULL,
  "deviceId" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "namespace" VARCHAR(16) NOT NULL CHECK ("namespace" = '/devices'),
  "role" "DeviceClientRole" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "DeviceGrant_ticket_scope_key" UNIQUE ("ticketId", "credentialId", "deviceId", "organisationId", "role", "namespace"),
  FOREIGN KEY ("deviceId", "organisationId") REFERENCES "Device" ("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("ticketId", "credentialId", "deviceId", "organisationId", "role", "namespace") REFERENCES "DeviceTicket" ("id", "credentialId", "deviceId", "organisationId", "role", "namespace") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ("lastSeenAt" >= "createdAt" AND "expiresAt" = "lastSeenAt" + INTERVAL '35 seconds'),
  CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);
CREATE UNIQUE INDEX "DeviceGrant_primary_key" ON "DeviceGrant" ("deviceId") WHERE "role" = 'PRIMARY' AND "revokedAt" IS NULL;
CREATE INDEX "DeviceGrant_deviceId_organisationId_role_expiresAt_idx" ON "DeviceGrant" ("deviceId", "organisationId", "role", "expiresAt");
CREATE INDEX "DeviceGrant_expiresAt_idx" ON "DeviceGrant" ("expiresAt");

-- Credential scope is immutable. Terminal consumption/revocation never reverses.
CREATE FUNCTION svara_device_authority_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE field TEXT;
BEGIN
  IF (to_jsonb(OLD) - TG_ARGV) IS DISTINCT FROM (to_jsonb(NEW) - TG_ARGV) THEN
    RAISE EXCEPTION 'Device authority scope is immutable' USING ERRCODE = '23514';
  END IF;
  FOREACH field IN ARRAY ARRAY['revokedAt', 'redeemedAt', 'consumedAt'] LOOP
    IF to_jsonb(OLD)->>field IS NOT NULL AND (to_jsonb(OLD)->field) IS DISTINCT FROM (to_jsonb(NEW)->field) THEN
      RAISE EXCEPTION 'Device authority terminal state is immutable' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF (to_jsonb(NEW)->>'attempts')::integer < (to_jsonb(OLD)->>'attempts')::integer
    OR (to_jsonb(NEW)->>'lastSeenAt')::timestamptz < (to_jsonb(OLD)->>'lastSeenAt')::timestamptz
    OR (to_jsonb(NEW)->>'lastUsedAt')::timestamptz < (to_jsonb(OLD)->>'lastUsedAt')::timestamptz THEN
    RAISE EXCEPTION 'Device authority counters cannot move backwards' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PairingChallenge_immutable_scope" BEFORE UPDATE ON "PairingChallenge" FOR EACH ROW
  EXECUTE FUNCTION svara_device_authority_update('attempts', 'redeemedAt', 'revokedAt');
CREATE TRIGGER "DeviceCredential_immutable_scope" BEFORE UPDATE ON "DeviceCredential" FOR EACH ROW
  EXECUTE FUNCTION svara_device_authority_update('lastUsedAt', 'revokedAt');
CREATE TRIGGER "DeviceTicket_immutable_scope" BEFORE UPDATE ON "DeviceTicket" FOR EACH ROW
  EXECUTE FUNCTION svara_device_authority_update('consumedAt', 'revokedAt');
CREATE TRIGGER "DeviceGrant_immutable_scope" BEFORE UPDATE ON "DeviceGrant" FOR EACH ROW
  EXECUTE FUNCTION svara_device_authority_update('lastSeenAt', 'expiresAt', 'revokedAt');
