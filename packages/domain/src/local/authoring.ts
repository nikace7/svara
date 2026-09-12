import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { PrismaClient } from '@svara/database';
import {
  botCreateSchema,
  botDraftSchema,
  knowledgeSaveSchema,
  knowledgeApprovalErrors,
  mediaUploadSchema,
  presentationCreateSchema,
  resourceIdSchema,
  slideCreateSchema,
  MEDIA_LIMITS,
} from '@svara/contracts';
import type { BotDraft, KnowledgeDetail, SlideDetail } from '@svara/contracts';
import { captureRelease } from '../authoring/release-capture.js';
import { MediaJobs } from '../media/jobs.js';
import { MediaError } from '../media/errors.js';
import type { InspectMedia } from '../media/jobs.js';
import type { MediaStorage } from '../media/storage.js';

export interface LocalAuthoringBundle {
  organisationId: string;
  actorUserId: string;
  media: {
    key: string;
    filename: string;
    mimeType: 'image/png' | 'image/jpeg';
    bytes: Uint8Array;
  }[];
  bots: {
    id: string;
    name: string;
    description: string;
    config: BotDraft;
    knowledge: (Pick<KnowledgeDetail, 'title' | 'type' | 'question' | 'content'> & {
      approved: boolean;
      selected: boolean;
    })[];
    presentations: {
      name: string;
      selected: boolean;
      slides: (Pick<SlideDetail, 'title' | 'body' | 'target' | 'durationSeconds'> & {
        mediaKey: string | null;
      })[];
    }[];
    publish: boolean;
    afterPublishDraft?: BotDraft;
  }[];
}

function validate(bundle: LocalAuthoringBundle) {
  resourceIdSchema.parse(bundle.organisationId);
  resourceIdSchema.parse(bundle.actorUserId);
  if (bundle.bots.length < 1 || bundle.bots.length > 10 || bundle.media.length > 20)
    throw new Error('Invalid local fixture limits.');
  if (new Set(bundle.bots.map((bot) => bot.id)).size !== bundle.bots.length)
    throw new Error('Duplicate local bot ID.');
  const mediaKeys = new Set(bundle.media.map((media) => media.key));
  if (mediaKeys.size !== bundle.media.length) throw new Error('Duplicate local media key.');
  for (const media of bundle.media) {
    if (!/^[a-z][a-z0-9-]{0,60}$/.test(media.key)) throw new Error('Invalid local media key.');
    mediaUploadSchema.parse({
      filename: media.filename,
      mimeType: media.mimeType,
      byteLength: media.bytes.byteLength,
    });
  }
  for (const bot of bundle.bots) {
    resourceIdSchema.parse(bot.id);
    botCreateSchema.parse({ name: bot.name, description: bot.description });
    botDraftSchema.parse(bot.config);
    if (bot.afterPublishDraft) {
      if (!bot.publish) throw new Error('A following draft requires a published example.');
      botDraftSchema.parse(bot.afterPublishDraft);
    }
    if (
      bot.knowledge.length > 200 ||
      bot.presentations.length > 20 ||
      bot.presentations.filter((deck) => deck.selected).length > 1
    )
      throw new Error('Invalid local authoring limits.');
    for (const entry of bot.knowledge) {
      knowledgeSaveSchema.parse({
        title: entry.title,
        type: entry.type,
        question: entry.question,
        content: entry.content,
        expectedRevision: 1,
      });
      if (entry.approved && Object.keys(knowledgeApprovalErrors(entry)).length)
        throw new Error('Approved fixture knowledge needs both translations.');
    }
    for (const deck of bot.presentations) {
      presentationCreateSchema.parse({ botId: bot.id, name: deck.name });
      if (deck.slides.length > 50) throw new Error('Invalid local slide limit.');
      for (const slide of deck.slides) {
        if (slide.mediaKey !== null && !mediaKeys.has(slide.mediaKey))
          throw new Error('Unknown local media reference.');
        slideCreateSchema.parse({
          title: slide.title,
          body: slide.body,
          target: slide.target,
          durationSeconds: slide.durationSeconds,
          mediaId: null,
          expectedRevision: 1,
        });
      }
    }
  }
}

/** CLI-only provisioning. Caller must verify the local database target before invoking. */
export async function seedLocalAuthoring(
  db: PrismaClient,
  bundle: LocalAuthoringBundle,
  storage: MediaStorage,
  inspect: InspectMedia,
): Promise<boolean> {
  validate(bundle);
  const markerId = `local-authoring:v1:${bundle.organisationId}`;
  const prepared: { id: string; leaseToken: string }[] = [];
  const jobs = new MediaJobs(db, storage, inspect);
  try {
    return await db.$transaction(
      async (tx) => {
        // A per-organisation lock plus READ COMMITTED lets a waiting seed see the first commit.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${markerId}, 0))`;
        if (
          (await tx.applicationMetadata.findUnique({ where: { id: 'svara' } }))?.schemaVersion !== 1
        )
          throw new Error('Refusing local authoring seed: missing application marker.');
        const marker = await tx.applicationMetadata.findUnique({ where: { id: markerId } });
        if (marker) {
          if (marker.schemaVersion !== 1) throw new Error('Unsupported local authoring marker.');
          return false;
        }
        const actors = await tx.$queryRaw<
          { id: string }[]
        >`SELECT m."id" FROM "Membership" m JOIN "User" u ON u."id" = m."userId" WHERE m."organisationId" = ${bundle.organisationId}::uuid AND u."id" = ${bundle.actorUserId}::uuid AND m."enabled" AND NOT u."disabled" AND m."role" IN ('OWNER', 'ADMINISTRATOR') FOR SHARE OF m, u`;
        const actor = actors[0];
        if (!actor)
          throw new Error(
            'Refusing local fixtures: an enabled author in this organisation is required.',
          );
        if (await tx.bot.count({ where: { id: { in: bundle.bots.map((bot) => bot.id) } } }))
          throw new Error('Refusing to adopt an existing bot ID without the local fixture marker.');
        const budget = await tx.mediaAsset.aggregate({
          where: { organisationId: bundle.organisationId },
          _count: true,
          _sum: { declaredBytes: true },
        });
        if (
          budget._count + bundle.media.length > MEDIA_LIMITS.organisationAssets ||
          (budget._sum.declaredBytes ?? 0) +
            bundle.media.reduce((sum, media) => sum + media.bytes.byteLength, 0) >
            MEDIA_LIMITS.organisationBytes
        )
          throw new MediaError('MEDIA_QUOTA');
        const mediaIds = new Map<string, string>();
        for (const media of bundle.media) {
          const id = randomUUID();
          const leaseToken = randomUUID();
          const signal = AbortSignal.timeout(15000);
          const receipt = await storage.receive(
            id,
            media.bytes.byteLength,
            Readable.from([media.bytes]),
            signal,
          );
          prepared.push({ id, leaseToken });
          const claim = {
            id,
            leaseToken,
            declaredMime: media.mimeType,
            declaredBytes: media.bytes.byteLength,
            sourceSha256: receipt.sha256,
          };
          const output = await jobs.verifyInspection(claim, await inspect(claim, signal));
          await tx.mediaAsset.create({
            data: {
              id,
              organisationId: bundle.organisationId,
              createdByMembershipId: actor.id,
              filename: media.filename,
              declaredMime: media.mimeType,
              declaredBytes: media.bytes.byteLength,
              uploadedBytes: media.bytes.byteLength,
              sourceSha256: receipt.sha256,
              state: 'READY',
              attempts: 1,
              uploadedAt: new Date(),
              inspectedAt: new Date(),
              ...output,
            },
          });
          mediaIds.set(media.key, id);
          await tx.auditEntry.create({
            data: {
              organisationId: bundle.organisationId,
              actorKind: 'LOCAL',
              action: 'media.seeded.inspected.local',
              targetId: id,
            },
          });
        }
        for (const bot of bundle.bots) {
          await tx.bot.create({
            data: {
              id: bot.id,
              organisationId: bundle.organisationId,
              name: bot.name,
              description: bot.description,
              draft: { create: { config: bot.config } },
            },
          });
          for (const entry of bot.knowledge)
            await tx.knowledgeEntry.create({
              data: {
                organisationId: bundle.organisationId,
                botId: bot.id,
                title: entry.title,
                type: entry.type,
                questionEn: entry.question.en,
                questionNe: entry.question.ne,
                contentEn: entry.content.en,
                contentNe: entry.content.ne,
                status: entry.approved ? 'APPROVED' : 'DRAFT',
                selected: entry.selected,
                approvedAt: entry.approved ? new Date() : null,
                approvedByMembershipId: entry.approved ? actor.id : null,
              },
            });
          for (const deck of bot.presentations) {
            const presentation = await tx.presentation.create({
              data: { organisationId: bundle.organisationId, botId: bot.id, name: deck.name },
            });
            for (const [position, slide] of deck.slides.entries()) {
              const mediaId = slide.mediaKey === null ? null : mediaIds.get(slide.mediaKey)!;
              await tx.slide.create({
                data: {
                  organisationId: bundle.organisationId,
                  presentationId: presentation.id,
                  position,
                  titleEn: slide.title.en,
                  titleNe: slide.title.ne,
                  bodyEn: slide.body.en,
                  bodyNe: slide.body.ne,
                  target: slide.target,
                  durationSeconds: slide.durationSeconds,
                  mediaId,
                  mediaState: mediaId ? 'READY' : null,
                },
              });
            }
            if (deck.selected)
              await tx.botDraft.update({
                where: { botId: bot.id },
                data: { presentationId: presentation.id },
              });
          }
          if (bot.publish) {
            const release = await captureRelease(tx, {
              botId: bot.id,
              organisationId: bundle.organisationId,
              expectedRevision: 1,
              kind: 'PUBLISHED',
              providerMode: 'fixture',
              clock: () => new Date(),
            });
            await tx.auditEntry.create({
              data: {
                organisationId: bundle.organisationId,
                actorKind: 'LOCAL',
                action: 'release.seeded.local',
                targetId: release.id,
              },
            });
          }
          if (bot.afterPublishDraft) {
            await tx.botDraft.update({
              where: { botId: bot.id },
              data: { config: bot.afterPublishDraft },
            });
            await tx.bot.update({ where: { id: bot.id }, data: { revision: 2 } });
          }
          await tx.auditEntry.create({
            data: {
              organisationId: bundle.organisationId,
              actorKind: 'LOCAL',
              action: 'bot.seeded.local',
              targetId: bot.id,
            },
          });
        }
        await tx.applicationMetadata.create({ data: { id: markerId, schemaVersion: 1 } });
        await tx.auditEntry.create({
          data: {
            organisationId: bundle.organisationId,
            actorKind: 'LOCAL',
            action: 'authoring.seeded.local',
            targetId: bundle.organisationId,
          },
        });
        return true;
      },
      { isolationLevel: 'ReadCommitted', maxWait: 65000, timeout: 60000 },
    );
  } finally {
    // A commit acknowledgement can be lost: inspect database references before removing outputs.
    // If that read fails, leave the files for normal orphan reconciliation, never guess absence.
    for (const asset of prepared) {
      const retained = await db.mediaAsset.findUnique({ where: { id: asset.id } });
      await storage.remove(`${asset.id}.upload`);
      for (const suffix of ['ready', 'thumb']) {
        const key = `${asset.id}.${asset.leaseToken}.${suffix}`;
        if (retained?.storageKey !== key && retained?.thumbnailKey !== key)
          await storage.remove(key);
      }
    }
  }
}
