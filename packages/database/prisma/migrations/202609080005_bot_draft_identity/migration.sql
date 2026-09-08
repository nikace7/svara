-- Explicit composite uniqueness lets Prisma represent the tenant-bound one-to-one relation.
CREATE UNIQUE INDEX "BotDraft_botId_organisationId_key" ON "BotDraft"("botId", "organisationId");
