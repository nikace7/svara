import type { Prisma } from '@svara/database';
import { RELEASE_LIMITS } from '@svara/contracts';
import { IdentityError } from '../identity/errors.js';
import { AuthoringError } from './errors.js';
import { assembleRelease, releaseDraftInclude, releaseSnapshotHash } from './release-assembly.js';
import { ReleaseError } from './release-errors.js';

/** Internal transaction primitive. Callers establish staff or guarded local-seed authority. */
export async function captureRelease(
  tx: Prisma.TransactionClient,
  input: {
    botId: string;
    organisationId: string;
    expectedRevision: number;
    kind: 'PUBLISHED' | 'PREVIEW';
    providerMode: 'fixture' | 'live';
    clock: () => Date;
  },
): Promise<Prisma.BotReleaseGetPayload<object>> {
  const { botId, organisationId, expectedRevision, kind, providerMode } = input;
  await tx.$queryRaw`SELECT "id" FROM "Bot" WHERE "id" = ${botId}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`;
  const bot = await tx.bot.findFirst({
    where: { id: botId, organisationId },
    include: releaseDraftInclude,
  });
  if (!bot) throw new IdentityError('NOT_FOUND');
  if (bot.revision !== expectedRevision)
    throw new AuthoringError('REVISION_CONFLICT', bot.revision);
  if (bot.archivedAt) throw new AuthoringError('ARCHIVED', bot.revision);
  const { readiness, snapshot } = assembleRelease(bot, providerMode);
  if (!snapshot || !(kind === 'PUBLISHED' ? readiness.canPublish : readiness.canPreview))
    throw new ReleaseError('RELEASE_NOT_READY', readiness);
  if (kind === 'PUBLISHED' && bot.nextReleaseVersion >= 2147483646)
    throw new ReleaseError('RELEASE_LIMIT');
  // The no-op preview write forces serializable callers to retry a concurrent draft capture.
  const increment = kind === 'PUBLISHED' ? 1 : 0;
  await tx.$executeRaw`UPDATE "Bot" SET "nextReleaseVersion" = "nextReleaseVersion" + ${increment} WHERE "id" = ${botId}::uuid AND "organisationId" = ${organisationId}::uuid`;
  const createdAt = input.clock();
  const snapshotHash = releaseSnapshotHash(snapshot);
  const release = await tx.botRelease.create({
    data: {
      organisationId,
      botId,
      kind,
      version: kind === 'PUBLISHED' ? bot.nextReleaseVersion : null,
      previewExpiresAt:
        kind === 'PREVIEW'
          ? new Date(createdAt.getTime() + RELEASE_LIMITS.previewMilliseconds)
          : null,
      botRevision: bot.revision,
      providerMode,
      snapshot,
      snapshotHash,
      createdAt,
    },
  });
  if (snapshot.knowledge.length)
    await tx.releaseKnowledge.createMany({
      data: snapshot.knowledge.flatMap((entry) =>
        (['en', 'ne'] as const).map((locale) => ({
          releaseId: release.id,
          organisationId,
          snapshotHash,
          entryId: entry.id,
          locale,
          type: entry.type,
          title: entry.title,
          question: entry.question[locale],
          content: entry.content[locale],
        })),
      ),
    });
  if (snapshot.media.length)
    await tx.releaseMedia.createMany({
      data: snapshot.media.map((asset) => ({
        releaseId: release.id,
        organisationId,
        snapshotHash,
        mediaId: asset.id,
        sha256: asset.sha256,
        byteLength: asset.byteLength,
      })),
    });
  return release;
}
