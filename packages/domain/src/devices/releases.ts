import {
  releaseSnapshotSchema,
  resourceIdSchema,
  runtimeManifestQuerySchema,
} from '@svara/contracts';
import type { RuntimeManifest, RuntimeRelease } from '@svara/contracts';
import type { Prisma } from '@svara/database';
import { IdentityError } from '../identity/errors.js';
import { MediaError } from '../media/errors.js';
import type { MediaStorage } from '../media/storage.js';
import type { DeviceRuntime } from './runtime.js';
import { parse } from './core.js';

type Transaction = Prisma.TransactionClient;

/** A published release as screens render it: greeting, slides and media, never knowledge. */
export async function runtimeRelease(
  tx: Transaction,
  id: string,
  organisationId: string,
): Promise<RuntimeRelease> {
  const row = await tx.botRelease.findFirst({
    where: { id, organisationId, kind: 'PUBLISHED' },
    select: { id: true, version: true, snapshot: true },
  });
  if (!row?.version) throw new IdentityError('NOT_FOUND');
  const snapshot = releaseSnapshotSchema.parse(row.snapshot);
  return {
    id: row.id,
    version: row.version,
    botName: snapshot.bot.name,
    greeting: snapshot.bot.config.greeting,
    slides: (snapshot.presentation?.slides ?? []).map((slide) => ({
      id: slide.id,
      position: slide.position,
      title: slide.title,
      body: slide.body,
      mediaId: slide.mediaId,
      target: slide.target,
      durationSeconds: slide.durationSeconds,
    })),
    media: snapshot.media,
  };
}

/**
 * What a paired device may download: its desired release (to apply next) or its applied
 * release (what its displays mirror). Knowledge never leaves the server, and media outside
 * those two releases is refused even when it belongs to the same organisation.
 */
export class DeviceReleases {
  constructor(
    private readonly runtime: DeviceRuntime,
    private readonly storage: MediaStorage,
  ) {}

  async manifest(token: string, value: unknown): Promise<RuntimeManifest> {
    const { view } = parse(runtimeManifestQuerySchema, value);
    return this.runtime.asCredential(token, async (tx, { deviceId, organisationId }) => {
      const state = await tx.desiredDeviceState.findUnique({ where: { deviceId } });
      const revision = (view === 'desired' ? state?.revision : state?.appliedRevision) ?? 0;
      const releaseId = view === 'desired' ? state?.releaseId : state?.appliedReleaseId;
      const command = revision
        ? await tx.deviceCommand.findFirst({
            where: { deviceId, organisationId, stateRevision: revision, type: 'release.apply' },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          })
        : null;
      return {
        view,
        revision,
        commandId: command?.id ?? null,
        release: releaseId ? await runtimeRelease(tx, releaseId, organisationId) : null,
      };
    });
  }

  async media(token: string, id: string) {
    parse(resourceIdSchema, id);
    const asset = await this.runtime.asCredential(
      token,
      async (tx, { deviceId, organisationId }) => {
        const state = await tx.desiredDeviceState.findUnique({ where: { deviceId } });
        const releases = [state?.releaseId, state?.appliedReleaseId].filter(
          (value): value is string => !!value,
        );
        const referenced = await tx.releaseMedia.findFirst({
          where: { mediaId: id, organisationId, releaseId: { in: releases } },
          select: { media: true },
        });
        if (!referenced) throw new IdentityError('NOT_FOUND');
        return referenced.media;
      },
    );
    return openReadyMedia(this.storage, asset);
  }
}

/** Opens a READY asset whose stored length still matches; the caller streams and closes it. */
export async function openReadyMedia(
  storage: MediaStorage,
  asset: Prisma.MediaAssetGetPayload<object>,
) {
  if (asset.state !== 'READY' || !asset.storageKey || !asset.mimeType || !asset.sha256)
    throw new MediaError('MEDIA_NOT_READY');
  const { handle, size } = await storage.read(asset.storageKey);
  if (size !== asset.byteLength) {
    await handle.close();
    throw new MediaError('INTEGRITY_MISMATCH');
  }
  return {
    handle,
    byteLength: size,
    sha256: asset.sha256,
    mimeType: asset.mimeType,
    filename: asset.filename,
  };
}
