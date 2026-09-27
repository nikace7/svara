import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { RuntimeRelease } from '@svara/contracts';
import { prepareRelease } from './device-runtime.js';

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const asset = (id: string, text: string) => ({
  id,
  filename: `${id}.png`,
  mimeType: 'image/png' as const,
  sha256: createHash('sha256').update(text).digest('hex'),
  byteLength: text.length,
  width: 10,
  height: 10,
  durationSeconds: null,
});
const slide = (id: string, mediaId: string, target: 'PRIMARY' | 'SECONDARY' | 'BOTH') => ({
  id: crypto.randomUUID(),
  position: 0,
  title: { en: id, ne: id },
  body: { en: '', ne: '' },
  mediaId,
  target,
  durationSeconds: 10,
});
const release: RuntimeRelease = {
  id: crypto.randomUUID(),
  version: 2,
  botName: 'Guide',
  greeting: { en: 'Welcome.', ne: 'स्वागत छ।' },
  slides: [slide('a', 'kiosk', 'PRIMARY'), slide('b', 'wall', 'SECONDARY')],
  media: [asset('kiosk', 'kiosk image'), asset('wall', 'wall image')],
};
const files: Record<string, string> = { kiosk: 'kiosk image', wall: 'wall image' };

describe('release preparation', () => {
  it('downloads and verifies only the media this screen shows', async () => {
    const loaded: string[] = [];
    const prepared = await prepareRelease(
      release,
      'DISPLAY',
      async (id) => {
        loaded.push(id);
        return bytes(files[id]!);
      },
      (_bytes, mime) => `blob:${mime}`,
    );
    expect(loaded).toEqual(['wall']);
    expect(prepared.urls).toEqual({ wall: 'blob:image/png' });
  });

  it('refuses tampered or failed downloads with a coded reason', async () => {
    await expect(
      prepareRelease(
        release,
        'PRIMARY',
        async () => bytes('kiosk imagX'),
        () => 'blob:',
      ),
    ).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    await expect(
      prepareRelease(
        release,
        'PRIMARY',
        async () => bytes('short'),
        () => 'blob:',
      ),
    ).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    await expect(
      prepareRelease(
        release,
        'PRIMARY',
        async () => {
          throw new Error('offline');
        },
        () => 'blob:',
      ),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
  });
});
