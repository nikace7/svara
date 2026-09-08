import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@svara/database';
import { MEDIA_LIMITS, mediaRejectionSchema, resourceIdSchema } from '@svara/contracts';
import type { MediaRejection } from '@svara/contracts';
import { MediaError } from './errors.js';
import type { MediaStorage } from './storage.js';

export type InspectionClaim = {
  id: string;
  leaseToken: string;
  declaredMime: string;
  declaredBytes: number;
  sourceSha256: string;
};
export type InspectedMedia = {
  mimeType: 'image/png' | 'image/jpeg' | 'video/mp4';
  storageKey: string;
  byteLength: number;
  sha256: string;
  width: number;
  height: number;
  durationSeconds: number | null;
  thumbnailKey: string | null;
  thumbnailBytes: number | null;
  thumbnailSha256: string | null;
};
export type InspectMedia = (
  claim: InspectionClaim,
  signal?: AbortSignal,
) => Promise<InspectedMedia>;
type Asset = Prisma.MediaAssetGetPayload<object>;
type Claim = Asset & { leaseToken: string; sourceSha256: string };
export type MediaJobOutcome = 'READY' | 'REJECTED' | 'RETRY' | 'STALE' | 'SKIPPED';
const leaseMs = 45_000;
const maxAttempts = 3;
const hashPattern = /^[a-f0-9]{64}$/;
const boundedInteger = (value: number | null, maximum: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maximum;

/** PostgreSQL owns job state. Redis may lose or redeliver any notification. */
export class MediaJobs {
  private scan: ReturnType<MediaStorage['entries']> | undefined;
  constructor(
    private readonly db: PrismaClient,
    private readonly storage: MediaStorage,
    private readonly inspect: InspectMedia,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private available(): Prisma.MediaAssetWhereInput {
    return {
      OR: [{ state: 'QUARANTINED' }, { state: 'INSPECTING', leaseExpiresAt: { lte: this.now() } }],
    };
  }
  async pending(): Promise<string[]> {
    return (
      await this.db.mediaAsset.findMany({
        where: this.available(),
        select: { id: true },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: 50,
      })
    ).map((asset) => asset.id);
  }
  private async audit(tx: Prisma.TransactionClient, asset: Asset, action: string) {
    await tx.auditEntry.create({
      data: {
        organisationId: asset.organisationId,
        actorKind: 'SYSTEM',
        action,
        targetId: asset.id,
      },
    });
  }
  private async rejectAbandoned(asset: Asset, reason: MediaRejection) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.mediaAsset.updateMany({
        where: {
          id: asset.id,
          organisationId: asset.organisationId,
          state: asset.state,
          revision: asset.revision,
        },
        data: {
          state: 'REJECTED',
          rejection: reason,
          leaseToken: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      if (result.count) await this.audit(tx, asset, 'media.inspection.expired');
      return result.count > 0;
    });
  }
  private async claim(id: string): Promise<Claim | undefined> {
    const asset = await this.db.mediaAsset.findFirst({ where: { id, ...this.available() } });
    if (!asset) return;
    if (
      (asset.uploadedAt ?? asset.createdAt).getTime() + MEDIA_LIMITS.retentionMs <=
        this.now().getTime() ||
      asset.attempts >= maxAttempts ||
      !asset.sourceSha256
    ) {
      await this.rejectAbandoned(
        asset,
        asset.attempts >= maxAttempts ? 'INSPECTION_UNAVAILABLE' : 'UPLOAD_EXPIRED',
      );
      return;
    }
    const leaseToken = randomUUID();
    return this.db.$transaction(async (tx) => {
      const result = await tx.mediaAsset.updateMany({
        where: {
          id,
          organisationId: asset.organisationId,
          revision: asset.revision,
          ...this.available(),
        },
        data: {
          state: 'INSPECTING',
          leaseToken,
          leaseExpiresAt: new Date(this.now().getTime() + leaseMs),
          attempts: { increment: 1 },
          rejection: null,
          revision: { increment: 1 },
        },
      });
      if (!result.count) return;
      const claimed = await tx.mediaAsset.findUniqueOrThrow({ where: { id } });
      await this.audit(tx, asset, 'media.inspection.started');
      return { ...claimed, leaseToken, sourceSha256: asset.sourceSha256! };
    });
  }
  private current(claim: Claim): Prisma.MediaAssetWhereInput {
    return {
      id: claim.id,
      organisationId: claim.organisationId,
      state: 'INSPECTING',
      leaseToken: claim.leaseToken,
      leaseExpiresAt: { gt: this.now() },
    };
  }
  private async verify(claim: Claim, output: InspectedMedia): Promise<InspectedMedia> {
    const key = `${claim.id}.${claim.leaseToken}`;
    const video = claim.declaredMime === 'video/mp4';
    if (
      !output ||
      output.storageKey !== `${key}.ready` ||
      output.mimeType !== claim.declaredMime ||
      !boundedInteger(
        output.byteLength,
        video ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.imageBytes,
      ) ||
      !hashPattern.test(output.sha256) ||
      !boundedInteger(output.width, Number.MAX_SAFE_INTEGER) ||
      !boundedInteger(output.height, Number.MAX_SAFE_INTEGER) ||
      (video
        ? output.width > MEDIA_LIMITS.videoWidth ||
          output.height > MEDIA_LIMITS.videoHeight ||
          typeof output.durationSeconds !== 'number' ||
          !Number.isFinite(output.durationSeconds) ||
          output.durationSeconds <= 0 ||
          output.durationSeconds > MEDIA_LIMITS.videoSeconds ||
          output.thumbnailKey !== null ||
          output.thumbnailBytes !== null ||
          output.thumbnailSha256 !== null
        : output.width * output.height > MEDIA_LIMITS.imagePixels ||
          output.durationSeconds !== null ||
          output.thumbnailKey !== `${key}.thumb` ||
          !boundedInteger(output.thumbnailBytes, 2 * 1024 * 1024) ||
          !output.thumbnailSha256 ||
          !hashPattern.test(output.thumbnailSha256))
    )
      throw new MediaError('INTEGRITY_MISMATCH');
    const canonical = await this.storage.checksum(output.storageKey);
    if (
      canonical.byteLength !== output.byteLength ||
      canonical.sha256 !== output.sha256 ||
      (video &&
        (canonical.byteLength !== claim.declaredBytes || canonical.sha256 !== claim.sourceSha256))
    )
      throw new MediaError('INTEGRITY_MISMATCH');
    if (output.thumbnailKey) {
      const thumbnail = await this.storage.checksum(output.thumbnailKey);
      if (
        thumbnail.byteLength !== output.thumbnailBytes ||
        thumbnail.sha256 !== output.thumbnailSha256
      )
        throw new MediaError('INTEGRITY_MISMATCH');
    }
    // Select fields explicitly: an adapter cannot inject state, scope or revisions.
    return {
      storageKey: output.storageKey,
      mimeType: output.mimeType,
      ...canonical,
      width: output.width,
      height: output.height,
      durationSeconds: output.durationSeconds,
      thumbnailKey: output.thumbnailKey,
      thumbnailBytes: output.thumbnailBytes,
      thumbnailSha256: output.thumbnailSha256,
    };
  }
  private async removeOwnOutputs(claim: Claim) {
    // A read failure preserves files. It must never be mistaken for proof of absence.
    const asset = await this.db.mediaAsset.findUnique({ where: { id: claim.id } });
    for (const suffix of ['ready', 'thumb']) {
      const key = `${claim.id}.${claim.leaseToken}.${suffix}`;
      if (asset?.storageKey === key || asset?.thumbnailKey === key) continue;
      await this.storage.remove(key);
    }
  }
  private async failed(claim: Claim, error: unknown): Promise<MediaJobOutcome> {
    const reason = mediaRejectionSchema.safeParse(
      error instanceof Error && 'code' in error ? error.code : undefined,
    );
    const code = reason.success ? reason.data : 'INSPECTION_UNAVAILABLE';
    const retry = code === 'INSPECTION_UNAVAILABLE' && claim.attempts < maxAttempts;
    const changed = await this.db.$transaction(async (tx) => {
      const result = await tx.mediaAsset.updateMany({
        where: this.current(claim),
        data: {
          state: retry ? 'QUARANTINED' : 'REJECTED',
          rejection: retry ? null : code,
          leaseToken: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      if (result.count)
        await this.audit(tx, claim, retry ? 'media.inspection.retry' : 'media.inspection.rejected');
      return result.count > 0;
    });
    await this.removeOwnOutputs(claim);
    return changed ? (retry ? 'RETRY' : 'REJECTED') : 'STALE';
  }
  async process(id: string, signal?: AbortSignal): Promise<MediaJobOutcome> {
    resourceIdSchema.parse(id);
    if (signal?.aborted) return 'SKIPPED';
    const claimed = await this.claim(id);
    if (!claimed) return 'SKIPPED';
    const deadline = AbortSignal.timeout(MEDIA_LIMITS.inspectionMs);
    const inspectionSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    let output: InspectedMedia;
    try {
      output = await this.verify(claimed, await this.inspect(claimed, inspectionSignal));
      if (inspectionSignal.aborted) throw new MediaError('INSPECTION_TIMEOUT');
    } catch (error) {
      return this.failed(claimed, error);
    }
    // Keep commit outside the inspection catch. An uncertain acknowledgement may
    // already have persisted READY; preserve its outputs and let reconciliation read it.
    const completed = await this.db.$transaction(async (tx) => {
      const result = await tx.mediaAsset.updateMany({
        where: this.current(claimed),
        data: {
          ...output,
          state: 'READY',
          rejection: null,
          inspectedAt: this.now(),
          leaseToken: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      if (result.count) await this.audit(tx, claimed, 'media.inspection.ready');
      return result.count > 0;
    });
    if (!completed) {
      await this.removeOwnOutputs(claimed);
      return 'STALE';
    }
    await this.storage.remove(`${id}.upload`);
    return 'READY';
  }

  private async removeKnownFiles(asset: Asset) {
    const keys = new Set([
      `${asset.id}.part`,
      `${asset.id}.upload`,
      asset.storageKey,
      asset.thumbnailKey,
    ]);
    for (const key of keys) if (key) await this.storage.remove(key);
  }
  async sweep(fileLimit = 100): Promise<void> {
    if (!Number.isInteger(fileLimit) || fileLimit < 1 || fileLimit > 1000)
      throw new Error('Invalid media sweep limit.');
    const now = this.now();
    const before = new Date(now.getTime() - MEDIA_LIMITS.retentionMs);
    const retainedAge: Prisma.MediaAssetWhereInput = {
      OR: [{ uploadedAt: { lte: before } }, { uploadedAt: null, createdAt: { lte: before } }],
    };
    const expired = await this.db.mediaAsset.findMany({
      where: {
        OR: [
          { state: { in: ['UPLOADING', 'QUARANTINED'] }, AND: retainedAge },
          { state: 'RECEIVING', leaseExpiresAt: { lte: now } },
          {
            state: 'INSPECTING',
            leaseExpiresAt: { lte: now },
            OR: [{ attempts: { gte: maxAttempts } }, retainedAge],
          },
        ],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    for (const asset of expired)
      await this.rejectAbandoned(
        asset,
        asset.state === 'RECEIVING'
          ? 'UPLOAD_INTERRUPTED'
          : asset.attempts >= maxAttempts
            ? 'INSPECTION_UNAVAILABLE'
            : 'UPLOAD_EXPIRED',
      );
    const cleanup = await this.db.mediaAsset.findMany({
      where: {
        OR: [{ state: 'DELETING' }, { state: 'REJECTED', AND: retainedAge, cleanedAt: null }],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    for (const asset of cleanup) {
      await this.removeKnownFiles(asset);
      const where = {
        id: asset.id,
        organisationId: asset.organisationId,
        revision: asset.revision,
        state: asset.state,
      };
      if (asset.state === 'DELETING') await this.db.mediaAsset.deleteMany({ where });
      else await this.db.mediaAsset.updateMany({ where, data: { cleanedAt: now } });
    }
    // Retain the directory cursor across ticks so old READY files cannot starve
    // later orphan entries. Iteration is flat and never follows directory links.
    this.scan ??= this.storage.entries();
    for (let index = 0; index < fileLimit; index++) {
      const next = await this.scan.next();
      if (next.done) {
        this.scan = undefined;
        break;
      }
      const file = next.value;
      if (file.modifiedAt > before) continue;
      const asset = await this.db.mediaAsset.findUnique({ where: { id: file.assetId } });
      if (
        asset &&
        (['UPLOADING', 'RECEIVING', 'QUARANTINED', 'INSPECTING'].includes(asset.state) ||
          asset.storageKey?.toLowerCase() === file.key.toLowerCase() ||
          asset.thumbnailKey?.toLowerCase() === file.key.toLowerCase())
      )
        continue;
      await this.storage.remove(file.key);
    }
  }
  async close(): Promise<void> {
    await this.scan?.return(undefined);
    this.scan = undefined;
  }
}
