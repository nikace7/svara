-- CreateEnum
CREATE TYPE "StaffGrantPurpose" AS ENUM ('INVITATION', 'RECOVERY');

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tokenHash" VARCHAR(64) NOT NULL,
    "membershipId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffGrant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tokenHash" VARCHAR(64) NOT NULL,
    "purpose" "StaffGrantPurpose" NOT NULL,
    "organisationId" UUID NOT NULL,
    "issuerMembershipId" UUID NOT NULL,
    "targetMembershipId" UUID,
    "email" VARCHAR(254) NOT NULL,
    "role" "MembershipRole",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StaffGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "targetId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_membershipId_idx" ON "StaffSession"("membershipId");

-- CreateIndex
CREATE INDEX "StaffSession_expiresAt_idx" ON "StaffSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffGrant_tokenHash_key" ON "StaffGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffGrant_organisationId_email_purpose_idx" ON "StaffGrant"("organisationId", "email", "purpose");

-- CreateIndex
CREATE INDEX "StaffGrant_expiresAt_idx" ON "StaffGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "StaffGrant_issuerMembershipId_idx" ON "StaffGrant"("issuerMembershipId");

-- CreateIndex
CREATE INDEX "StaffGrant_targetMembershipId_idx" ON "StaffGrant"("targetMembershipId");

-- CreateIndex
CREATE INDEX "AuditEntry_organisationId_createdAt_idx" ON "AuditEntry"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEntry_actorMembershipId_idx" ON "AuditEntry"("actorMembershipId");

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_membershipId_organisationId_fkey" FOREIGN KEY ("membershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffGrant" ADD CONSTRAINT "StaffGrant_issuerMembershipId_organisationId_fkey" FOREIGN KEY ("issuerMembershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffGrant" ADD CONSTRAINT "StaffGrant_targetMembershipId_organisationId_fkey" FOREIGN KEY ("targetMembershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actorMembershipId_organisationId_fkey" FOREIGN KEY ("actorMembershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;
