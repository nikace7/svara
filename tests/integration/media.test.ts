import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffFixture } from './staff-fixture.js';
import { MediaService } from '../../packages/domain/src/media/service.js';
import { MediaStorage } from '../../packages/domain/src/media/storage.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';

describe('scoped media upload lifecycle', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let root: string;
  let media: MediaService;
  const bytes = Buffer.from('not yet inspected');
  const input = { filename: 'स्वागत.png', mimeType: 'image/png', byteLength: bytes.length };
  beforeAll(async () => {
    staff = await staffFixture();
    root = await mkdtemp(join(tmpdir(), 'svara-media-integration-'));
    media = new MediaService(
      new IdentityService(staff.db, staff.pepper),
      staff.db,
      await MediaStorage.open(root),
    );
  });
  afterAll(async () => {
    if (staff) {
      await staff.db.mediaAsset.deleteMany({
        where: {
          organisation: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
        },
      });
      await staff.close();
    }
    if (root) {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('svara-media-integration-')
      )
        throw new Error('Unsafe media test cleanup target.');
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reserves private metadata and keeps uploaded bytes unavailable until inspection', async () => {
    const entry = await media.reserve(staff.owner.token, input);
    expect(entry).toMatchObject({
      filename: input.filename,
      state: 'UPLOADING',
      revision: 1,
      sha256: null,
    });
    await expect(media.file(staff.owner.token, entry.id, false)).rejects.toMatchObject({
      code: 'MEDIA_NOT_READY',
    });
    const uploaded = await media.receive(
      staff.owner.token,
      entry.id,
      Readable.from([bytes]),
      AbortSignal.timeout(1000),
    );
    expect(uploaded).toMatchObject({
      state: 'QUARANTINED',
      uploadedBytes: bytes.length,
      byteLength: null,
      sha256: null,
    });
    await expect(media.file(staff.owner.token, entry.id, false)).rejects.toMatchObject({
      code: 'MEDIA_NOT_READY',
    });
    expect(await readdir(root)).toContain(`${entry.id}.upload`);
    expect(
      (await media.list(staff.owner.token, { search: 'स्वागत', state: 'QUARANTINED' })).items.some(
        (item) => item.id === entry.id,
      ),
    ).toBe(true);
    expect(JSON.stringify(uploaded)).not.toMatch(
      /storageKey|leaseToken|organisationId|sourceSha256/,
    );
    await media.remove(staff.owner.token, entry.id, { expectedRevision: uploaded.revision });
  });

  it('rejects interrupted bytes and never leaves a partial file available', async () => {
    const entry = await media.reserve(staff.owner.token, { ...input, byteLength: 100 });
    await expect(
      media.receive(staff.owner.token, entry.id, Readable.from([bytes]), AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code: 'UPLOAD_LENGTH_MISMATCH' });
    const rejected = await media.get(staff.owner.token, entry.id);
    expect(rejected).toMatchObject({ state: 'REJECTED', rejection: 'UPLOAD_LENGTH_MISMATCH' });
    expect((await readdir(root)).filter((name) => name.startsWith(entry.id))).toEqual([]);
    await expect(media.remove(staff.owner.token, entry.id, {})).rejects.toMatchObject({
      code: 'PRECONDITION_REQUIRED',
    });
    await expect(
      media.remove(staff.owner.token, entry.id, { expectedRevision: entry.revision }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await media.remove(staff.owner.token, entry.id, { expectedRevision: rejected.revision });
  });

  it('rechecks authority when a stream finishes and rejects a revoked uploader', async () => {
    const other = await staff.service.register({
      email: `revoked-${staff.suffix}`,
      password: staff.password,
      displayName: 'Revoked uploader',
      organisationName: 'Revocation media test',
    });
    const entry = await media.reserve(other.token, input);
    const source = Readable.from(
      (async function* () {
        yield bytes.subarray(0, 4);
        await staff.service.logout(other.token);
        yield bytes.subarray(4);
      })(),
    );
    await expect(
      media.receive(other.token, entry.id, source, AbortSignal.timeout(3000)),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await staff.db.mediaAsset.findUnique({ where: { id: entry.id } })).toMatchObject({
      state: 'REJECTED',
      rejection: 'UPLOAD_INTERRUPTED',
    });
    expect((await readdir(root)).filter((name) => name.startsWith(entry.id))).toEqual([]);
    expect(
      await staff.db.auditEntry.findFirst({
        where: { targetId: entry.id, action: 'media.upload.rejected' },
      }),
    ).toMatchObject({ actorKind: 'SYSTEM', actorMembershipId: null });
  });

  it('scopes ids, rejects caller-supplied authority and keeps viewers read-only', async () => {
    const other = await staff.service.register({
      email: `foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Other uploader',
      organisationName: 'Other media',
    });
    const entry = await media.reserve(other.token, input);
    await expect(media.get(staff.owner.token, entry.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      media.receive(staff.owner.token, entry.id, Readable.from([bytes]), AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      media.reserve(staff.owner.token, {
        ...input,
        organisationId: other.identity.organisation.id,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const email = `viewer-${staff.suffix}`;
    const grant = await staff.service.invite(staff.owner.token, { email, role: 'VIEWER' });
    await staff.service.activate({
      token: grant.token,
      password: staff.password,
      displayName: 'Media viewer',
    });
    const viewer = await staff.service.login({ email, password: staff.password });
    expect((await media.list(viewer.token, {})).items.every((item) => item.id !== entry.id)).toBe(
      true,
    );
    await expect(media.reserve(viewer.token, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      staff.db.mediaAsset.create({
        data: {
          organisationId: other.identity.organisation.id,
          createdByMembershipId: staff.owner.identity.membership.id,
          filename: 'foreign.png',
          declaredMime: 'image/png',
          declaredBytes: 10,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('bounds outstanding reservations per organisation even when requests race', async () => {
    const isolated = await staff.service.register({
      email: `quota-${staff.suffix}`,
      password: staff.password,
      displayName: 'Quota uploader',
      organisationName: 'Media quota',
    });
    for (let index = 0; index < 3; index++) await media.reserve(isolated.token, input);
    const results = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        media.reserve(isolated.token, { ...input, filename: `${randomUUID()}.png` }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'MEDIA_QUOTA' },
    });
    expect(
      await staff.db.mediaAsset.count({
        where: { organisationId: isolated.identity.organisation.id },
      }),
    ).toBe(4);
  });
});
