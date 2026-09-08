import { MEDIA_LIMITS } from '@svara/contracts';
import type { MediaRejection } from '@svara/contracts';

export class InspectionError extends Error {
  constructor(readonly code: MediaRejection) {
    super(code);
  }
}

export function detectMediaMime(bytes: Buffer): 'image/jpeg' | 'image/png' | 'video/mp4' {
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (
    bytes.length >= 16 &&
    bytes.readUInt32BE(0) >= 16 &&
    bytes.readUInt32BE(0) <= 4096 &&
    bytes.toString('ascii', 4, 8) === 'ftyp' &&
    ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V '].includes(
      bytes.toString('ascii', 8, 12),
    )
  )
    return 'video/mp4';
  throw new InspectionError('UNSUPPORTED_FORMAT');
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function duration(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[0-9]+(?:\.[0-9]+)?$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MEDIA_LIMITS.videoSeconds)
    throw new InspectionError('VIDEO_LIMITS');
  return parsed;
}

/** Metadata is untrusted even when produced by a successful native subprocess. */
export function validateVideoMetadata(value: unknown) {
  const root = record(value);
  const format = record(root?.format);
  if (!root || !format || !Array.isArray(root.streams) || !root.streams.length)
    throw new InspectionError('INVALID_MEDIA');
  const streams = root.streams.map(record);
  const videos = streams.filter((stream) => stream?.codec_type === 'video');
  const audio = streams.filter((stream) => stream?.codec_type === 'audio');
  const video = videos[0];
  if (
    !video ||
    videos.length !== 1 ||
    audio.length > 1 ||
    videos.length + audio.length !== streams.length ||
    video.codec_name !== 'h264' ||
    !['yuv420p', 'yuvj420p'].includes(String(video.pix_fmt)) ||
    record(video.disposition)?.attached_pic === 1 ||
    audio.some((stream) => stream?.codec_name !== 'aac')
  )
    throw new InspectionError('UNSUPPORTED_CODEC');
  const { width, height } = video;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MEDIA_LIMITS.videoWidth ||
    height > MEDIA_LIMITS.videoHeight
  )
    throw new InspectionError('VIDEO_LIMITS');
  const durationSeconds = Math.max(
    duration(format.duration),
    ...streams.map((stream) => duration(stream?.duration)),
  );
  return { width, height, durationSeconds };
}
