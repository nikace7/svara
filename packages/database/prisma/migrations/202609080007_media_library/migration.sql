ALTER TYPE "AuditActorKind" ADD VALUE 'SYSTEM';
ALTER TABLE "AuditEntry" DROP CONSTRAINT "AuditEntry_actor_kind_check";
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actor_kind_check" CHECK (
  ("actorKind"::text = 'STAFF' AND "actorMembershipId" IS NOT NULL) OR
  ("actorKind"::text IN ('LOCAL', 'SYSTEM') AND "actorMembershipId" IS NULL)
);

CREATE TYPE "MediaState" AS ENUM ('UPLOADING', 'RECEIVING', 'QUARANTINED', 'INSPECTING', 'READY', 'REJECTED', 'DELETING');
CREATE TABLE "MediaAsset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisationId" UUID NOT NULL,
  "createdByMembershipId" UUID NOT NULL,
  "filename" VARCHAR(160) NOT NULL,
  "declaredMime" VARCHAR(32) NOT NULL,
  "declaredBytes" INTEGER NOT NULL,
  "state" "MediaState" NOT NULL DEFAULT 'UPLOADING',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "uploadedBytes" INTEGER NOT NULL DEFAULT 0,
  "sourceSha256" VARCHAR(64),
  "storageKey" VARCHAR(80),
  "thumbnailKey" VARCHAR(80),
  "mimeType" VARCHAR(32),
  "byteLength" INTEGER,
  "sha256" VARCHAR(64),
  "width" INTEGER,
  "height" INTEGER,
  "durationSeconds" DOUBLE PRECISION,
  "thumbnailBytes" INTEGER,
  "thumbnailSha256" VARCHAR(64),
  "rejection" VARCHAR(40),
  "leaseToken" UUID,
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "uploadedAt" TIMESTAMPTZ(3),
  "inspectedAt" TIMESTAMPTZ(3),
  "cleanedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaAsset_input_check" CHECK (
    "declaredMime" IN ('image/jpeg', 'image/png', 'video/mp4') AND
    "declaredBytes" > 0 AND "declaredBytes" <= CASE WHEN "declaredMime" = 'video/mp4' THEN 52428800 ELSE 10485760 END AND
    "revision" > 0 AND "attempts" >= 0 AND "uploadedBytes" >= 0 AND "uploadedBytes" <= "declaredBytes"
  ),
  CONSTRAINT "MediaAsset_lease_check" CHECK (
    ("state" IN ('RECEIVING', 'INSPECTING') AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR
    ("state" NOT IN ('RECEIVING', 'INSPECTING') AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
  ),
  CONSTRAINT "MediaAsset_ready_check" CHECK ("state" <> 'READY' OR (
    "sourceSha256" IS NOT NULL AND "sourceSha256" ~ '^[0-9a-f]{64}$' AND "uploadedBytes" = "declaredBytes" AND
    "storageKey" IS NOT NULL AND left("storageKey", 37) = "id"::text || '.' AND
    "mimeType" IS NOT NULL AND "mimeType" = "declaredMime" AND
    "byteLength" IS NOT NULL AND "byteLength" > 0 AND "byteLength" <= CASE WHEN "mimeType" = 'video/mp4' THEN 52428800 ELSE 10485760 END AND
    "sha256" IS NOT NULL AND "sha256" ~ '^[0-9a-f]{64}$' AND
    "width" IS NOT NULL AND "width" > 0 AND "height" IS NOT NULL AND "height" > 0 AND
    "rejection" IS NULL AND "inspectedAt" IS NOT NULL AND
    (("mimeType" = 'video/mp4' AND "width" <= 1920 AND "height" <= 1080 AND "durationSeconds" IS NOT NULL AND "durationSeconds" > 0 AND "durationSeconds" <= 120) OR
     ("mimeType" <> 'video/mp4' AND "width"::bigint * "height"::bigint <= 25000000 AND "durationSeconds" IS NULL AND
      "thumbnailKey" IS NOT NULL AND left("thumbnailKey", 37) = "id"::text || '.' AND
      "thumbnailBytes" IS NOT NULL AND "thumbnailBytes" > 0 AND "thumbnailBytes" <= 2097152 AND
      "thumbnailSha256" IS NOT NULL AND "thumbnailSha256" ~ '^[0-9a-f]{64}$'))
  )),
  CONSTRAINT "MediaAsset_rejection_check" CHECK (
    ("state" <> 'REJECTED' OR "rejection" IS NOT NULL) AND
    ("rejection" IS NULL OR "rejection" IN ('UPLOAD_INTERRUPTED', 'UPLOAD_LENGTH_MISMATCH', 'UNSUPPORTED_FORMAT', 'INVALID_MEDIA', 'IMAGE_TOO_LARGE', 'VIDEO_LIMITS', 'UNSUPPORTED_CODEC', 'INSPECTION_TIMEOUT', 'INSPECTION_UNAVAILABLE', 'INTEGRITY_MISMATCH', 'UPLOAD_EXPIRED'))
  )
);
CREATE UNIQUE INDEX "MediaAsset_id_organisationId_key" ON "MediaAsset"("id", "organisationId");
CREATE INDEX "MediaAsset_organisationId_createdAt_idx" ON "MediaAsset"("organisationId", "createdAt");
CREATE INDEX "MediaAsset_state_leaseExpiresAt_idx" ON "MediaAsset"("state", "leaseExpiresAt");
CREATE INDEX "MediaAsset_state_createdAt_idx" ON "MediaAsset"("state", "createdAt");
CREATE INDEX "MediaAsset_createdByMembershipId_idx" ON "MediaAsset"("createdByMembershipId");
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdByMembershipIdId_organisationId_fkey" FOREIGN KEY ("createdByMembershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;
