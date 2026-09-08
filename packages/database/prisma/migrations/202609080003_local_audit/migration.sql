CREATE TYPE "AuditActorKind" AS ENUM ('STAFF', 'LOCAL');
ALTER TABLE "AuditEntry"
  ADD COLUMN "actorKind" "AuditActorKind" NOT NULL DEFAULT 'STAFF',
  ALTER COLUMN "actorMembershipId" DROP NOT NULL;
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actor_kind_check" CHECK (
  ("actorKind" = 'STAFF' AND "actorMembershipId" IS NOT NULL) OR
  ("actorKind" = 'LOCAL' AND "actorMembershipId" IS NULL)
);
