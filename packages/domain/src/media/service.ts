import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Prisma, PrismaClient } from '@svara/database';
import {
  MEDIA_LIMITS,
  mediaDeleteSchema,
  mediaDetailSchema,
  mediaListSchema,
  mediaUploadSchema,
  resourceIdSchema,
} from '@svara/contracts';
import type { MediaDetail, MediaPage, MediaRejection } from '@svara/contracts';
import type { IdentityService } from '../identity/service.js';
import { IdentityError } from '../identity/errors.js';
import { AuthoringError } from '../authoring/errors.js';
import { MediaError } from './errors.js';
import type { MediaStorage } from './storage.js';

type Asset = Prisma.MediaAssetGetPayload<object>;
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
function parse<T>(schema: Schema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new IdentityError('INVALID_INPUT');
  return parsed.data;
}
export function mediaDetail(asset: Asset): MediaDetail {
  return mediaDetailSchema.parse({
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType ?? asset.declaredMime,
    state: asset.state,
    revision: asset.revision,
    uploadedBytes: asset.uploadedBytes,
    byteLength: asset.byteLength,
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    hasThumbnail: asset.thumbnailKey !== null,
    rejection: asset.rejection,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  });
}

export class MediaService {
  constructor(
    private readonly identity: IdentityService,
    private readonly db: PrismaClient,
    private readonly storage: MediaStorage,
  ) {}
  private async load(tx: Prisma.TransactionClient, organisationId: string, id: string) {
    const asset = await tx.mediaAsset.findFirst({ where: { id, organisationId } });
    if (!asset) throw new IdentityError('NOT_FOUND');
    return asset;
  }
  private async audit(
    tx: Prisma.TransactionClient,
    organisationId: string,
    actorMembershipId: string,
    action: string,
    targetId: string,
  ) {
    await tx.auditEntry.create({ data: { organisationId, actorMembershipId, action, targetId } });
  }
  async reserve(token: string, value: unknown): Promise<MediaDetail> {
    const input = parse(mediaUploadSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const where = { organisationId: member.organisationId };
      const budget = await tx.mediaAsset.aggregate({
        where,
        _count: true,
        _sum: { declaredBytes: true },
      });
      const pending = await tx.mediaAsset.count({
        where: { ...where, state: { in: ['UPLOADING', 'RECEIVING', 'QUARANTINED', 'INSPECTING'] } },
      });
      if (
        budget._count >= MEDIA_LIMITS.organisationAssets ||
        (budget._sum.declaredBytes ?? 0) + input.byteLength > MEDIA_LIMITS.organisationBytes ||
        pending >= MEDIA_LIMITS.pendingUploads
      )
        throw new MediaError('MEDIA_QUOTA');
      const asset = await tx.mediaAsset.create({
        data: {
          organisationId: member.organisationId,
          createdByMembershipId: member.id,
          filename: input.filename,
          declaredMime: input.mimeType,
          declaredBytes: input.byteLength,
        },
      });
      await this.audit(tx, member.organisationId, member.id, 'media.reserved', asset.id);
      return mediaDetail(asset);
    });
  }
  async get(token: string, id: string): Promise<MediaDetail> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => mediaDetail(await this.load(tx, member.organisationId, id)),
      false,
    );
  }
  async list(token: string, value: unknown): Promise<MediaPage> {
    const query = parse(mediaListSchema, value);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const where: Prisma.MediaAssetWhereInput = {
          organisationId: member.organisationId,
          ...(query.search ? { filename: { contains: query.search, mode: 'insensitive' } } : {}),
          ...(query.state === 'ALL' ? {} : { state: query.state }),
          ...(query.kind === 'IMAGE'
            ? { declaredMime: { in: ['image/jpeg', 'image/png'] } }
            : query.kind === 'VIDEO'
              ? { declaredMime: 'video/mp4' }
              : {}),
        };
        const items = await tx.mediaAsset.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.pageSize,
          skip: (query.page - 1) * query.pageSize,
        });
        return {
          items: items.map(mediaDetail),
          total: await tx.mediaAsset.count({ where }),
          page: query.page,
          pageSize: query.pageSize,
        };
      },
      false,
    );
  }
  async receive(
    token: string,
    id: string,
    source: Readable,
    signal: AbortSignal,
  ): Promise<MediaDetail> {
    parse(resourceIdSchema, id);
    const claimed = await this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const asset = await this.load(tx, member.organisationId, id);
      if (asset.state !== 'UPLOADING') throw new MediaError('MEDIA_BUSY');
      if (asset.createdAt.getTime() + MEDIA_LIMITS.retentionMs <= Date.now())
        throw new MediaError('UPLOAD_EXPIRED');
      return tx.mediaAsset.update({
        where: { id },
        data: {
          state: 'RECEIVING',
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + MEDIA_LIMITS.uploadMs + 10_000),
          revision: { increment: 1 },
        },
      });
    });
    try {
      const receipt = await this.storage.receive(id, claimed.declaredBytes, source, signal);
      return await this.identity.asStaff(token, 'author', async (tx, { member }) => {
        const asset = await this.load(tx, member.organisationId, id);
        if (
          asset.state !== 'RECEIVING' ||
          asset.leaseToken !== claimed.leaseToken ||
          !asset.leaseExpiresAt ||
          asset.leaseExpiresAt.getTime() <= Date.now()
        )
          throw new MediaError('MEDIA_BUSY');
        const updated = await tx.mediaAsset.update({
          where: { id },
          data: {
            state: 'QUARANTINED',
            uploadedBytes: receipt.byteLength,
            sourceSha256: receipt.sha256,
            uploadedAt: new Date(),
            leaseToken: null,
            leaseExpiresAt: null,
            revision: { increment: 1 },
          },
        });
        await this.audit(tx, member.organisationId, member.id, 'media.uploaded', id);
        return mediaDetail(updated);
      });
    } catch (error) {
      const reason: MediaRejection =
        error instanceof MediaError && error.code === 'UPLOAD_LENGTH_MISMATCH'
          ? error.code
          : 'UPLOAD_INTERRUPTED';
      try {
        const rejected = await this.db.$transaction(async (tx) => {
          const result = await tx.mediaAsset.updateMany({
            where: {
              id,
              organisationId: claimed.organisationId,
              state: 'RECEIVING',
              leaseToken: claimed.leaseToken,
            },
            data: {
              state: 'REJECTED',
              rejection: reason,
              leaseToken: null,
              leaseExpiresAt: null,
              revision: { increment: 1 },
            },
          });
          if (result.count)
            await tx.auditEntry.create({
              data: {
                organisationId: claimed.organisationId,
                actorKind: 'SYSTEM',
                action: 'media.upload.rejected',
                targetId: id,
              },
            });
          return result.count > 0;
        });
        // Preserve bytes if commit acknowledgement was lost but QUARANTINED persisted.
        // A failed cleanup remains private and is reclaimed by the worker after expiry.
        if (rejected) await this.storage.remove(`${id}.upload`);
      } catch {
        console.error(JSON.stringify({ event: 'media.upload.cleanup.failed', assetId: id }));
      }
      throw error;
    }
  }
  async remove(token: string, id: string, value: unknown): Promise<{ ok: true }> {
    parse(resourceIdSchema, id);
    if (value && typeof value === 'object' && !('expectedRevision' in value))
      throw new AuthoringError('PRECONDITION_REQUIRED');
    const input = parse(mediaDeleteSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const asset = await this.load(tx, member.organisationId, id);
      if (asset.revision !== input.expectedRevision)
        throw new AuthoringError('REVISION_CONFLICT', asset.revision);
      if (
        (await tx.slide.count({ where: { mediaId: id, organisationId: member.organisationId } })) ||
        (await tx.releaseMedia.count({
          where: { mediaId: id, organisationId: member.organisationId },
        }))
      )
        throw new MediaError('MEDIA_IN_USE');
      if (asset.state === 'RECEIVING' || asset.state === 'INSPECTING' || asset.state === 'DELETING')
        throw new MediaError('MEDIA_BUSY');
      await tx.mediaAsset.update({
        where: { id },
        data: {
          state: 'DELETING',
          leaseToken: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      await this.audit(tx, member.organisationId, member.id, 'media.deleted', id);
      return { ok: true };
    });
  }
  async file(token: string, id: string, thumbnail: boolean) {
    parse(resourceIdSchema, id);
    const descriptor = await this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const asset = await this.load(tx, member.organisationId, id);
        if (asset.state !== 'READY') throw new MediaError('MEDIA_NOT_READY');
        const key = thumbnail ? asset.thumbnailKey : asset.storageKey;
        if (!key) throw new IdentityError('NOT_FOUND');
        const byteLength = thumbnail ? asset.thumbnailBytes : asset.byteLength;
        const sha256 = thumbnail ? asset.thumbnailSha256 : asset.sha256;
        const mimeType = thumbnail ? 'image/png' : asset.mimeType;
        if (!byteLength || !sha256 || !mimeType) throw new MediaError('INTEGRITY_MISMATCH');
        return { key, filename: asset.filename, byteLength, sha256, mimeType };
      },
      false,
    );
    const { key, ...metadata } = descriptor;
    const { handle, size } = await this.storage.read(key);
    if (size !== metadata.byteLength) {
      await handle.close();
      throw new MediaError('INTEGRITY_MISMATCH');
    }
    return { ...metadata, handle };
  }
}
