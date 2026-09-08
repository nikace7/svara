import { z } from 'zod';
import { revisionSchema } from './authoring.js';

export const MEDIA_LIMITS = {
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  imagePixels: 25_000_000,
  videoWidth: 1920,
  videoHeight: 1080,
  videoSeconds: 120,
  inspectionMs: 15_000,
  uploadMs: 120_000,
  retentionMs: 24 * 60 * 60 * 1000,
  organisationBytes: 512 * 1024 * 1024,
  organisationAssets: 250,
  pendingUploads: 4,
} as const;

export const mediaMimeSchema = z.enum(['image/jpeg', 'image/png', 'video/mp4']);
export const mediaStateSchema = z.enum([
  'UPLOADING',
  'RECEIVING',
  'QUARANTINED',
  'INSPECTING',
  'READY',
  'REJECTED',
  'DELETING',
]);
export const mediaRejectionSchema = z.enum([
  'UPLOAD_INTERRUPTED',
  'UPLOAD_LENGTH_MISMATCH',
  'UNSUPPORTED_FORMAT',
  'INVALID_MEDIA',
  'IMAGE_TOO_LARGE',
  'VIDEO_LIMITS',
  'UNSUPPORTED_CODEC',
  'INSPECTION_TIMEOUT',
  'INSPECTION_UNAVAILABLE',
  'INTEGRITY_MISMATCH',
  'UPLOAD_EXPIRED',
]);
export type MediaRejection = z.infer<typeof mediaRejectionSchema>;
export const mediaRejectionMessages: Record<MediaRejection, string> = {
  UPLOAD_INTERRUPTED: 'The upload was interrupted. Choose the file again to retry.',
  UPLOAD_LENGTH_MISMATCH: 'The received size differs from the selected file. Upload it again.',
  UNSUPPORTED_FORMAT:
    'Use a genuine JPEG, PNG or MP4 file. Renaming an extension does not convert a file.',
  INVALID_MEDIA: 'This file could not be read safely. Export a new copy and upload it again.',
  IMAGE_TOO_LARGE: 'Use an image up to 25 megapixels whose processed copy fits within 10 MiB.',
  VIDEO_LIMITS: 'Use a video up to 1920 × 1080 and 120 seconds long.',
  UNSUPPORTED_CODEC: 'Export MP4 with H.264 video and AAC audio, or no audio track.',
  INSPECTION_TIMEOUT: 'Inspection exceeded its time limit. Try a smaller, freshly exported file.',
  INSPECTION_UNAVAILABLE:
    'Media inspection is unavailable. Check worker readiness before uploading again.',
  INTEGRITY_MISMATCH: 'The stored file failed its integrity check. Upload the original file again.',
  UPLOAD_EXPIRED: 'This unfinished upload expired. Choose the file again to retry.',
};

const filename = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(
    (value) =>
      value !== '.' &&
      value !== '..' &&
      Array.from(value).every((character) => {
        const code = character.charCodeAt(0);
        return (
          code >= 32 &&
          (code < 127 || code > 159) &&
          (code < 0x202a || code > 0x202e) &&
          (code < 0x2066 || code > 0x2069) &&
          !'\\/'.includes(character)
        );
      }),
    'Use a display filename without paths, control characters or directional overrides.',
  );
export const mediaUploadSchema = z
  .strictObject({
    filename,
    mimeType: mediaMimeSchema,
    byteLength: z.number().int().positive().max(MEDIA_LIMITS.videoBytes),
  })
  .refine(
    (value) => value.mimeType === 'video/mp4' || value.byteLength <= MEDIA_LIMITS.imageBytes,
    'Images must fit within 10 MiB.',
  );
export const mediaDeleteSchema = z.strictObject({ expectedRevision: revisionSchema });
export const mediaListSchema = z.strictObject({
  search: z.string().trim().max(160).default(''),
  state: z.union([z.literal('ALL'), mediaStateSchema]).default('ALL'),
  kind: z.enum(['ALL', 'IMAGE', 'VIDEO']).default('ALL'),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export const mediaListQuerySchema = z
  .strictObject({
    search: z.string().max(160).optional(),
    state: z.union([z.literal('ALL'), mediaStateSchema]).optional(),
    kind: z.enum(['ALL', 'IMAGE', 'VIDEO']).optional(),
    page: z
      .string()
      .regex(/^[0-9]+$/)
      .transform(Number)
      .optional(),
    pageSize: z
      .string()
      .regex(/^[0-9]+$/)
      .transform(Number)
      .optional(),
  })
  .pipe(mediaListSchema);
export const mediaDetailSchema = z.strictObject({
  id: z.uuid(),
  filename,
  mimeType: mediaMimeSchema,
  state: mediaStateSchema,
  revision: revisionSchema,
  uploadedBytes: z.number().int().nonnegative(),
  byteLength: z.number().int().positive().nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().positive().nullable(),
  hasThumbnail: z.boolean(),
  rejection: mediaRejectionSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const mediaPageSchema = z.strictObject({
  items: z.array(mediaDetailSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
});
export type MediaDetail = z.infer<typeof mediaDetailSchema>;
export type MediaPage = z.infer<typeof mediaPageSchema>;
