import { describe, expect, it } from 'vitest';
import { detectMediaMime, validateVideoMetadata } from './policy.js';

const video = (overrides: Record<string, unknown> = {}) => ({
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      duration: '120.0',
      pix_fmt: 'yuv420p',
    },
    { codec_type: 'audio', codec_name: 'aac', duration: '120.0' },
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '120.0' },
  ...overrides,
});

describe('media content admission', () => {
  it('recognizes JPEG, PNG and bounded MP4 brands from bytes', () => {
    expect(detectMediaMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectMediaMime(Buffer.from('89504e470d0a1a0a', 'hex'))).toBe('image/png');
    expect(
      detectMediaMime(Buffer.from('000000186674797069736f6d0000020069736f6d6d703432', 'hex')),
    ).toBe('video/mp4');
    for (const bytes of [
      Buffer.from('<svg/>'),
      Buffer.from('not PNG'),
      Buffer.from('000000186674797071742020000000006d703432', 'hex'),
    ]) {
      expect(() => detectMediaMime(bytes)).toThrow('UNSUPPORTED_FORMAT');
    }
  });

  it('accepts H.264 with AAC or no audio within exact limits', () => {
    expect(validateVideoMetadata(video())).toEqual({
      width: 1920,
      height: 1080,
      durationSeconds: 120,
    });
    expect(validateVideoMetadata(video({ streams: [video().streams[0]] }))).toMatchObject({
      durationSeconds: 120,
    });
  });

  it('rejects unsupported codecs, auxiliary streams and browser-incompatible pixel formats', () => {
    for (const streams of [
      [{ ...video().streams[0], codec_name: 'hevc' }],
      [video().streams[0], { codec_type: 'audio', codec_name: 'mp3' }],
      [video().streams[0], { codec_type: 'subtitle', codec_name: 'mov_text' }],
      [video().streams[0], video().streams[0]],
      [{ ...video().streams[0], pix_fmt: 'yuv444p10le' }],
    ])
      expect(() => validateVideoMetadata(video({ streams }))).toThrow('UNSUPPORTED_CODEC');
  });

  it('requires finite positive dimensions and duration in every present track', () => {
    for (const value of [0, -1, 120.01, 'NaN', 'Infinity', '1e9']) {
      expect(() => validateVideoMetadata(video({ format: { duration: value } }))).toThrow(
        'VIDEO_LIMITS',
      );
    }
    for (const change of [
      { width: 1921 },
      { height: 1081 },
      { width: 1.5 },
      { duration: '121' },
      { duration: undefined },
    ]) {
      expect(() =>
        validateVideoMetadata(video({ streams: [{ ...video().streams[0], ...change }] })),
      ).toThrow('VIDEO_LIMITS');
    }
    expect(() =>
      validateVideoMetadata(
        video({
          streams: [
            video().streams[0],
            { codec_type: 'audio', codec_name: 'aac', duration: '121' },
          ],
        }),
      ),
    ).toThrow('VIDEO_LIMITS');
    for (const value of [null, [], {}, { streams: 'invalid' }])
      expect(() => validateVideoMetadata(value)).toThrow('INVALID_MEDIA');
  });
});
