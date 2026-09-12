CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TYPE "ReleaseKind" AS ENUM ('PREVIEW', 'PUBLISHED');
ALTER TABLE "Bot" ADD COLUMN "nextReleaseVersion" INTEGER NOT NULL DEFAULT 1
  CHECK ("nextReleaseVersion" > 0);

CREATE TABLE "BotRelease" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisationId" UUID NOT NULL,
  "botId" UUID NOT NULL,
  "kind" "ReleaseKind" NOT NULL,
  "version" INTEGER,
  "previewExpiresAt" TIMESTAMPTZ(3),
  "botRevision" INTEGER NOT NULL CHECK ("botRevision" > 0),
  "providerMode" VARCHAR(8) NOT NULL CHECK ("providerMode" IN ('fixture', 'live')),
  "snapshot" JSONB NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL CHECK ("snapshotHash" ~ '^[a-f0-9]{64}$'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BotRelease_botId_organisationId_fkey" FOREIGN KEY ("botId", "organisationId")
    REFERENCES "Bot" ("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "BotRelease_lifecycle_check" CHECK (
    ("kind" = 'PUBLISHED' AND "version" IS NOT NULL AND "version" > 0 AND "previewExpiresAt" IS NULL)
    OR ("kind" = 'PREVIEW' AND "version" IS NULL AND "previewExpiresAt" IS NOT NULL
      AND "previewExpiresAt" = "createdAt" + INTERVAL '30 minutes')
  ),
  CONSTRAINT "BotRelease_snapshot_check" CHECK ((
    jsonb_typeof("snapshot") = 'object'
    AND "snapshot" ->> 'schemaVersion' = '1'
    AND "snapshot" #>> '{bot,id}' = "botId"::text
    AND ("snapshot" #>> '{bot,revision}')::integer = "botRevision"
    AND "snapshot" ->> 'providerMode' = "providerMode"
    AND jsonb_typeof("snapshot" -> 'knowledge') = 'array'
    AND jsonb_array_length("snapshot" -> 'knowledge') <= 200
    AND jsonb_typeof("snapshot" -> 'media') = 'array'
    AND jsonb_array_length("snapshot" -> 'media') <= 50
    AND octet_length("snapshot"::text) <= 4500000
  ) IS TRUE)
);
CREATE UNIQUE INDEX "BotRelease_id_organisationId_key" ON "BotRelease" ("id", "organisationId");
CREATE UNIQUE INDEX "BotRelease_id_organisationId_snapshotHash_key" ON "BotRelease" ("id", "organisationId", "snapshotHash");
CREATE UNIQUE INDEX "BotRelease_botId_version_key" ON "BotRelease" ("botId", "version");
CREATE INDEX "BotRelease_organisationId_botId_createdAt_idx" ON "BotRelease" ("organisationId", "botId", "createdAt");
CREATE INDEX "BotRelease_kind_previewExpiresAt_idx" ON "BotRelease" ("kind", "previewExpiresAt");

-- ECMAScript whitespace, without stripping Devanagari marks or digits. Raw frozen
-- text remains authoritative; generated fields cannot be supplied or edited.
CREATE FUNCTION svara_normalize_knowledge(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT lower(btrim(regexp_replace(normalize(value, NFC),
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g')))
$$;
CREATE TABLE "ReleaseKnowledge" (
  "releaseId" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "entryId" UUID NOT NULL,
  "locale" VARCHAR(2) NOT NULL CHECK ("locale" IN ('en', 'ne')),
  "type" "KnowledgeType" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "question" VARCHAR(500) NOT NULL,
  "content" VARCHAR(8000) NOT NULL,
  "searchText" TEXT GENERATED ALWAYS AS (svara_normalize_knowledge("title" || ' ' || "question" || ' ' || "content")) STORED,
  "normalizedQuestion" TEXT GENERATED ALWAYS AS (svara_normalize_knowledge("question")) STORED,
  "searchVector" TSVECTOR GENERATED ALWAYS AS (
    CASE WHEN "locale" = 'en' THEN to_tsvector('english', "title" || ' ' || "question" || ' ' || "content") ELSE NULL END
  ) STORED,
  CONSTRAINT "ReleaseKnowledge_pkey" PRIMARY KEY ("releaseId", "entryId", "locale"),
  CONSTRAINT "ReleaseKnowledge_release_fkey" FOREIGN KEY ("releaseId", "organisationId", "snapshotHash")
    REFERENCES "BotRelease" ("id", "organisationId", "snapshotHash") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE INDEX "ReleaseKnowledge_organisationId_releaseId_locale_idx" ON "ReleaseKnowledge" ("organisationId", "releaseId", "locale");
CREATE INDEX "ReleaseKnowledge_searchVector_idx" ON "ReleaseKnowledge" USING GIN ("searchVector");
CREATE INDEX "ReleaseKnowledge_searchText_idx" ON "ReleaseKnowledge" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX "ReleaseKnowledge_normalizedQuestion_idx" ON "ReleaseKnowledge" USING GIN ("normalizedQuestion" gin_trgm_ops);

CREATE UNIQUE INDEX "MediaAsset_release_identity_key" ON "MediaAsset" ("id", "organisationId", "state", "sha256", "byteLength");
CREATE TABLE "ReleaseMedia" (
  "releaseId" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "mediaId" UUID NOT NULL,
  "mediaState" "MediaState" NOT NULL DEFAULT 'READY' CHECK ("mediaState" = 'READY'),
  "sha256" VARCHAR(64) NOT NULL,
  "byteLength" INTEGER NOT NULL,
  CONSTRAINT "ReleaseMedia_pkey" PRIMARY KEY ("releaseId", "mediaId"),
  CONSTRAINT "ReleaseMedia_release_fkey" FOREIGN KEY ("releaseId", "organisationId", "snapshotHash")
    REFERENCES "BotRelease" ("id", "organisationId", "snapshotHash") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "ReleaseMedia_asset_fkey" FOREIGN KEY ("mediaId", "organisationId", "mediaState", "sha256", "byteLength")
    REFERENCES "MediaAsset" ("id", "organisationId", "state", "sha256", "byteLength") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "ReleaseMedia_mediaId_organisationId_idx" ON "ReleaseMedia" ("mediaId", "organisationId");

CREATE TABLE "IdempotencyRecord" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisationId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "operation" VARCHAR(64) NOT NULL CHECK ("operation" IN ('release.publish', 'release.preview')),
  "keyHash" VARCHAR(64) NOT NULL CHECK ("keyHash" ~ '^[a-f0-9]{64}$'),
  "requestHash" VARCHAR(64) NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  "releaseId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "IdempotencyRecord_expiry_check" CHECK ("expiresAt" = "createdAt" + INTERVAL '24 hours'),
  CONSTRAINT "IdempotencyRecord_actor_fkey" FOREIGN KEY ("actorMembershipId", "organisationId")
    REFERENCES "Membership" ("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "IdempotencyRecord_release_fkey" FOREIGN KEY ("releaseId", "organisationId")
    REFERENCES "BotRelease" ("id", "organisationId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "IdempotencyRecord_actor_operation_key" ON "IdempotencyRecord" ("actorMembershipId", "operation", "keyHash");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord" ("expiresAt");
CREATE INDEX "IdempotencyRecord_releaseId_organisationId_idx" ON "IdempotencyRecord" ("releaseId", "organisationId");

CREATE FUNCTION svara_release_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Saved releases are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "BotRelease_immutable" BEFORE UPDATE ON "BotRelease"
  FOR EACH ROW EXECUTE FUNCTION svara_release_immutable();

-- Child rows can only disappear with explicit parent retention cleanup. Bot
-- deletion cannot cascade releases, and there is no public release delete API.
CREATE FUNCTION svara_release_child_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "BotRelease" WHERE "id" = OLD."releaseId") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Saved release projections are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "ReleaseKnowledge_immutable" BEFORE UPDATE OR DELETE ON "ReleaseKnowledge"
  FOR EACH ROW EXECUTE FUNCTION svara_release_child_immutable();
CREATE TRIGGER "ReleaseMedia_immutable" BEFORE UPDATE OR DELETE ON "ReleaseMedia"
  FOR EACH ROW EXECUTE FUNCTION svara_release_child_immutable();

CREATE FUNCTION svara_release_projection_matches() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  frozen JSONB;
  entry JSONB;
BEGIN
  SELECT "snapshot" INTO frozen FROM "BotRelease"
    WHERE "id" = NEW."releaseId" AND "organisationId" = NEW."organisationId" AND "snapshotHash" = NEW."snapshotHash";
  IF TG_TABLE_NAME = 'ReleaseKnowledge' THEN
    SELECT value INTO entry FROM jsonb_array_elements(frozen -> 'knowledge') WHERE value ->> 'id' = NEW."entryId"::text;
    IF entry IS NULL OR (entry ->> 'type') IS DISTINCT FROM NEW."type"::text
      OR (entry ->> 'title') IS DISTINCT FROM NEW."title"
      OR (entry -> 'question' ->> NEW."locale") IS DISTINCT FROM NEW."question"
      OR (entry -> 'content' ->> NEW."locale") IS DISTINCT FROM NEW."content" THEN
      RAISE EXCEPTION 'Knowledge projection must match its snapshot' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT value INTO entry FROM jsonb_array_elements(frozen -> 'media') WHERE value ->> 'id' = NEW."mediaId"::text;
    IF entry IS NULL OR (entry ->> 'sha256') IS DISTINCT FROM NEW."sha256"
      OR (entry ->> 'byteLength')::integer IS DISTINCT FROM NEW."byteLength" THEN
      RAISE EXCEPTION 'Media reference must match its snapshot' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ReleaseKnowledge_snapshot" BEFORE INSERT ON "ReleaseKnowledge"
  FOR EACH ROW EXECUTE FUNCTION svara_release_projection_matches();
CREATE TRIGGER "ReleaseMedia_snapshot" BEFORE INSERT ON "ReleaseMedia"
  FOR EACH ROW EXECUTE FUNCTION svara_release_projection_matches();

-- Validate after assembly, at commit. Matching inserts + unique IDs + these
-- counts ensure neither missing nor extra projections can be committed.
CREATE FUNCTION svara_release_complete() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "BotRelease" WHERE "id" = NEW."id") THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM "ReleaseKnowledge" WHERE "releaseId" = NEW."id") <> 2 * jsonb_array_length(NEW."snapshot" -> 'knowledge')
    OR (SELECT count(*) FROM "ReleaseMedia" WHERE "releaseId" = NEW."id") <> jsonb_array_length(NEW."snapshot" -> 'media')
    OR (NEW."kind" = 'PUBLISHED' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW."snapshot" -> 'knowledge') WHERE (value ->> 'status') IS DISTINCT FROM 'APPROVED'
    )) THEN
    RAISE EXCEPTION 'Release assembly is incomplete or unapproved' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "BotRelease_complete" AFTER INSERT ON "BotRelease"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION svara_release_complete();
