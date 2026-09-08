import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication, createOpenApiDocument } from '../../apps/api/dist/app.js';
import { MediaJobs, MediaService, MediaStorage } from '../../packages/domain/dist/index.js';
import { parseServerConfig } from '../../packages/config/src/server.js';
import { MediaInspector } from '../../apps/worker/src/media/inspector.js';
import { imageFixture } from '../../apps/worker/test/media-fixtures.js';
import { staffFixture } from './staff-fixture.js';

describe('scoped streaming media HTTP', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let root: string;
  let media: MediaService;
  let jobs: MediaJobs;
  let bytes: Buffer;
  beforeAll(async () => {
    staff = await staffFixture();
    root = await mkdtemp(join(tmpdir(), 'svara-media-http-test-'));
    const storage = await MediaStorage.open(root);
    media = new MediaService(staff.service, staff.db, storage);
    const inspector = new MediaInspector(storage, parseServerConfig(process.env));
    jobs = new MediaJobs(staff.db, storage, inspector.inspect.bind(inspector));
    bytes = await imageFixture();
    const options = {
      providerMode: 'fixture' as const,
      localDocs: false,
      probe: async () => ({ status: 'ready' as const, dependencies: {} }),
      identity: staff.options,
      media,
    };
    app = await createApplication(options);
    await app.init();
  });
  afterEach(async () => {
    await staff.db.mediaAsset.deleteMany({
      where: { organisationId: staff.owner.identity.organisation.id },
    });
  });
  afterAll(async () => {
    await app?.close();
    await jobs?.close();
    await staff?.close();
    if (root) {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('svara-media-http-test-')
      )
        throw new Error('Unsafe media HTTP test cleanup.');
      await rm(root, { recursive: true, force: true });
    }
  });
  const http = () => request(app.getHttpServer());
  const headers = () => ({
    Host: 'localhost:4320',
    Origin: staff.options.origin,
    Cookie: `svara-session=${staff.owner.token}`,
    'X-CSRF-Token': staff.owner.csrfToken,
  });
  const metadata = () => ({
    filename: 'स्वागत.png',
    mimeType: 'image/png',
    byteLength: bytes.length,
  });
  const upload = () =>
    http()
      .post('/api/v1/media')
      .set(headers())
      .field('metadata', JSON.stringify(metadata()))
      .attach('file', bytes, { filename: 'client-name.png', contentType: 'image/png' });

  it('streams one multipart upload into quarantine and serves only inspected private bytes', async () => {
    const result = await upload().expect(202);
    const entry = result.body.data;
    expect(entry).toMatchObject({
      filename: 'स्वागत.png',
      state: 'QUARANTINED',
      uploadedBytes: bytes.length,
    });
    expect(JSON.stringify(entry)).not.toMatch(/storageKey|leaseToken|organisationId|sourceSha256/);
    await http().get(`/api/v1/media/${entry.id}/content`).set(headers()).expect(409);
    expect(await jobs.process(entry.id)).toBe('READY');
    const file = await media.file(staff.owner.token, entry.id, false);
    const expected = await file.handle.readFile();
    await file.handle.close();
    const content = await http()
      .get(`/api/v1/media/${entry.id}/content`)
      .set(headers())
      .expect(200);
    expect(content.body).toEqual(expected);
    expect(content.headers).toMatchObject({
      'content-type': 'image/png',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
      'accept-ranges': 'bytes',
      'content-length': String(expected.length),
      etag: `"${file.sha256}"`,
    });
    expect(content.headers['content-disposition']).toContain(encodeURIComponent('स्वागत.png'));
    const thumbnail = await http()
      .get(`/api/v1/media/${entry.id}/thumbnail`)
      .set(headers())
      .expect(200);
    expect(thumbnail.headers['content-type']).toBe('image/png');
    const page = await http()
      .get('/api/v1/media?search=स्वागत&state=READY&kind=IMAGE')
      .set(headers())
      .expect(200);
    expect(page.body.data.total).toBe(1);
  });

  it('supports bounded ranges, suffixes, HEAD and If-Range without exposing other organisations', async () => {
    const entry = (await upload().expect(202)).body.data;
    await jobs.process(entry.id);
    const detail = await media.get(staff.owner.token, entry.id);
    const partial = await http()
      .get(`/api/v1/media/${entry.id}/content`)
      .set(headers())
      .set('Range', 'bytes=0-7')
      .expect(206);
    expect(partial.body.length).toBe(8);
    expect(partial.headers['content-range']).toBe(`bytes 0-7/${detail.byteLength}`);
    const suffix = await http()
      .get(`/api/v1/media/${entry.id}/content`)
      .set(headers())
      .set('Range', 'bytes=-4')
      .expect(206);
    expect(suffix.body.length).toBe(4);
    await http()
      .head(`/api/v1/media/${entry.id}/content`)
      .set(headers())
      .expect(200)
      .expect('Content-Length', String(detail.byteLength));
    await http()
      .get(`/api/v1/media/${entry.id}/content`)
      .set(headers())
      .set('Range', 'bytes=0-7')
      .set('If-Range', '"stale"')
      .expect(200);
    const invalid = await http()
      .get(`/api/v1/media/${entry.id}/content`)
      .set(headers())
      .set('Range', 'bytes=0-1,3-4')
      .expect(416);
    expect(invalid.headers['content-range']).toBe(`bytes */${detail.byteLength}`);
    expect(invalid.body.error.code).toBe('INVALID_RANGE');
    const foreign = await staff.service.register({
      email: `media-foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Other',
      organisationName: 'Other campus',
    });
    const other = {
      ...headers(),
      Cookie: `svara-session=${foreign.token}`,
      'X-CSRF-Token': foreign.csrfToken,
    };
    for (const suffix of ['', '/content', '/thumbnail'])
      await http().get(`/api/v1/media/${entry.id}${suffix}`).set(other).expect(404);
    await http()
      .delete(`/api/v1/media/${entry.id}`)
      .set(other)
      .send({ expectedRevision: detail.revision })
      .expect(404);
  });

  it('requires staff, exact origin, CSRF and multipart on uploads while other mutations require JSON', async () => {
    await http().get('/api/v1/media').set('Host', 'localhost:4320').expect(401);
    await upload().unset('Cookie').expect(401);
    await upload().unset('X-CSRF-Token').expect(403);
    await upload().set('Origin', 'https://untrusted.example').expect(403);
    await http().post('/api/v1/media').set(headers()).send(metadata()).expect(400);
    await http().post('/api/v1/bots').set(headers()).field('name', 'Wrong body').expect(400);
    await http().get('/api/v1/media?state=invalid').set(headers()).expect(400);
    await staff.db.membership.update({
      where: { id: staff.owner.identity.membership.id },
      data: { role: 'VIEWER' },
    });
    try {
      await upload().expect(403);
    } finally {
      await staff.db.membership.update({
        where: { id: staff.owner.identity.membership.id },
        data: { role: 'OWNER' },
      });
    }
    expect(
      await staff.db.mediaAsset.count({
        where: { organisationId: staff.owner.identity.organisation.id },
      }),
    ).toBe(0);
  });

  it('rejects malformed metadata, extra parts and mismatched bytes without publishing quarantine', async () => {
    await http()
      .post('/api/v1/media')
      .set(headers())
      .field('metadata', '{}')
      .attach('file', bytes, 'x.png')
      .expect(400);
    await http()
      .post('/api/v1/media')
      .set(headers())
      .attach('file', bytes, 'x.png')
      .field('metadata', JSON.stringify(metadata()))
      .expect(400);
    await upload().field('unexpected', 'must reject').expect(400);
    await upload().attach('file', bytes, 'other.png').expect(400);
    const mismatch = await http()
      .post('/api/v1/media')
      .set(headers())
      .field('metadata', JSON.stringify({ ...metadata(), byteLength: bytes.length - 1 }))
      .attach('file', bytes, { filename: 'x.png', contentType: 'image/png' })
      .expect(422);
    expect(mismatch.body.error.code).toBe('UPLOAD_LENGTH_MISMATCH');
    const rows = await staff.db.mediaAsset.findMany({
      where: { organisationId: staff.owner.identity.organisation.id },
    });
    expect(rows.every((row) => row.state === 'REJECTED')).toBe(true);
    expect((await readdir(root)).some((name) => rows.some((row) => name.startsWith(row.id)))).toBe(
      false,
    );
  });

  it('requires deletion revisions and documents the multipart and binary response contract', async () => {
    const entry = (await upload().expect(202)).body.data;
    await http().delete(`/api/v1/media/${entry.id}`).set(headers()).send({}).expect(428);
    await http()
      .delete(`/api/v1/media/${entry.id}`)
      .set(headers())
      .send({ expectedRevision: 1 })
      .expect(409);
    await http()
      .delete(`/api/v1/media/${entry.id}`)
      .set(headers())
      .send({ expectedRevision: entry.revision })
      .expect(200);
    await jobs.sweep();
    await http().get(`/api/v1/media/${entry.id}`).set(headers()).expect(404);
    const document = createOpenApiDocument(app);
    expect(document.paths['/api/v1/media']?.post?.responses).toHaveProperty('202');
    expect(document.paths['/api/v1/media/{id}/content']?.get?.responses).toHaveProperty('206');
    expect(document.paths['/api/v1/media/{id}/content']?.get?.responses).toHaveProperty('416');
  });
});
