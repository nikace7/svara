import { describe, expect, it } from 'vitest';
import { mediaUploadSchema, mediaListQuerySchema, MEDIA_LIMITS } from './media.js';

describe('media admission contracts', () => {
  it('accepts only supported media within its own size limit', () => {
    expect(
      mediaUploadSchema.parse({
        filename: 'स्वागत.png',
        mimeType: 'image/png',
        byteLength: MEDIA_LIMITS.imageBytes,
      }).filename,
    ).toBe('स्वागत.png');
    expect(
      mediaUploadSchema.safeParse({
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
        byteLength: MEDIA_LIMITS.videoBytes,
      }).success,
    ).toBe(true);
    for (const value of [
      { filename: 'x.svg', mimeType: 'image/svg+xml', byteLength: 20 },
      { filename: 'x.png', mimeType: 'image/png', byteLength: MEDIA_LIMITS.imageBytes + 1 },
      { filename: 'x.mp4', mimeType: 'video/mp4', byteLength: MEDIA_LIMITS.videoBytes + 1 },
      { filename: 'x.png', mimeType: 'image/png', byteLength: 0 },
      { filename: 'x.png', mimeType: 'image/png', byteLength: 1, organisationId: 'injected' },
    ])
      expect(mediaUploadSchema.safeParse(value).success).toBe(false);
  });

  it('rejects path, control and directional filename tricks without losing Nepali text', () => {
    for (const filename of [
      '../file.png',
      'a\\b.png',
      'bad\r\nname.png',
      'fake\u202egnp.exe',
      '.',
      '..',
      'x'.repeat(161),
    ]) {
      expect(
        mediaUploadSchema.safeParse({ filename, mimeType: 'image/png', byteLength: 10 }).success,
      ).toBe(false);
    }
    expect(mediaListQuerySchema.parse({ state: 'READY', kind: 'IMAGE', page: '2' })).toMatchObject({
      page: 2,
      pageSize: 20,
    });
    expect(mediaListQuerySchema.safeParse({ state: ['READY', 'REJECTED'] }).success).toBe(false);
  });
});
