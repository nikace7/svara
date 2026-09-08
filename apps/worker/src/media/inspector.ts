import { constants } from 'node:fs';
import { copyFile, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { ServerConfig } from '@svara/config/server';
import {
  MEDIA_LIMITS,
  mediaRejectionSchema,
  mediaUploadSchema,
  resourceIdSchema,
} from '@svara/contracts';
import type { MediaStorage, InspectionClaim, InspectedMedia } from '@svara/domain';
import { detectMediaMime, InspectionError, validateVideoMetadata } from './policy.js';
import { runMediaProcess } from './process.js';

type InspectorConfig = Pick<
  ServerConfig,
  'MEDIA_INSPECTION_MODE' | 'FFPROBE_PATH' | 'MEDIA_SANDBOX_PATH'
>;

function ffprobeArguments(input: string) {
  return [
    '-v',
    'error',
    '-max_alloc',
    '67108864',
    '-protocol_whitelist',
    'file',
    '-format_whitelist',
    'mov',
    '-f',
    'mov',
    '-enable_drefs',
    '0',
    '-use_absolute_path',
    '0',
    '-threads',
    '1',
    '-analyzeduration',
    '5000000',
    '-probesize',
    '5242880',
    '-show_entries',
    'stream=codec_type,codec_name,width,height,duration,pix_fmt:stream_disposition=attached_pic:format=duration',
    '-of',
    'json',
    input,
  ];
}

export class MediaInspector {
  constructor(
    private readonly storage: MediaStorage,
    private readonly config: InspectorConfig,
  ) {}

  async inspect(claim: InspectionClaim, signal?: AbortSignal): Promise<InspectedMedia> {
    resourceIdSchema.parse(claim.id);
    resourceIdSchema.parse(claim.leaseToken);
    const admission = mediaUploadSchema.safeParse({
      filename: 'inspection',
      mimeType: claim.declaredMime,
      byteLength: claim.declaredBytes,
    });
    if (!admission.success || !/^[a-f0-9]{64}$/.test(claim.sourceSha256))
      throw new InspectionError('INVALID_MEDIA');
    const deadline = Date.now() + MEDIA_LIMITS.inspectionMs;
    const remaining = () => {
      const value = deadline - Date.now();
      if (value < 1 || signal?.aborted) throw new InspectionError('INSPECTION_TIMEOUT');
      return value;
    };
    const sourceKey = `${claim.id}.upload`;
    const key = `${claim.id}.${claim.leaseToken}.ready`;
    const thumbKey = `${claim.id}.${claim.leaseToken}.thumb`;
    const owned: string[] = [];
    try {
      const source = await this.storage.checksum(sourceKey);
      if (source.byteLength !== claim.declaredBytes || source.sha256 !== claim.sourceSha256)
        throw new InspectionError('INTEGRITY_MISMATCH');
      const { handle } = await this.storage.read(sourceKey);
      let mime: InspectedMedia['mimeType'];
      try {
        const prefix = Buffer.alloc(32);
        const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
        mime = detectMediaMime(prefix.subarray(0, bytesRead));
      } finally {
        await handle.close();
      }
      if (mime !== admission.data.mimeType) throw new InspectionError('UNSUPPORTED_FORMAT');
      const processOptions = { timeoutMs: remaining(), ...(signal ? { signal } : {}) };
      if (mime === 'video/mp4') {
        if (this.config.MEDIA_INSPECTION_MODE === 'sandboxed' && process.platform !== 'linux')
          throw new InspectionError('INSPECTION_UNAVAILABLE');
        const sandboxed = this.config.MEDIA_INSPECTION_MODE === 'sandboxed';
        const result = await runMediaProcess(
          sandboxed ? this.config.MEDIA_SANDBOX_PATH : this.config.FFPROBE_PATH,
          sandboxed
            ? [this.storage.path(sourceKey)]
            : ffprobeArguments(this.storage.path(sourceKey)),
          processOptions,
        );
        if (result.exitCode !== 0)
          throw new InspectionError(
            result.exitCode === 78 ? 'INSPECTION_UNAVAILABLE' : 'INVALID_MEDIA',
          );
        const metadata = validateVideoMetadata(this.parseJson(result.stdout));
        await copyFile(
          this.storage.path(sourceKey),
          this.storage.path(key),
          constants.COPYFILE_EXCL,
        );
        owned.push(key);
        const canonical = await this.storage.checksum(key);
        if (canonical.byteLength !== source.byteLength || canonical.sha256 !== source.sha256)
          throw new InspectionError('INTEGRITY_MISMATCH');
        remaining();
        return {
          mimeType: mime,
          storageKey: key,
          ...canonical,
          ...metadata,
          thumbnailKey: null,
          thumbnailBytes: null,
          thumbnailSha256: null,
        };
      }
      for (const output of [key, thumbKey]) {
        const file = await open(this.storage.path(output), 'wx', 0o600);
        owned.push(output);
        await file.close();
      }
      // Production builds use the emitted child, even when the supervisor runs through tsx.
      const child = fileURLToPath(new URL('../../dist/media/image-child.js', import.meta.url));
      const result = await runMediaProcess(
        process.execPath,
        [
          '--max-old-space-size=128',
          child,
          this.storage.path(sourceKey),
          this.storage.path(key),
          this.storage.path(thumbKey),
          mime,
          String(source.byteLength),
          source.sha256,
        ],
        { ...processOptions, timeoutMs: remaining() },
      );
      if (result.exitCode !== 0) throw new InspectionError('INVALID_MEDIA');
      const metadata = this.parseJson(result.stdout);
      if (!metadata || typeof metadata !== 'object') throw new InspectionError('INVALID_MEDIA');
      const output = metadata as Record<string, unknown>;
      if (output.ok !== true) {
        const reason = mediaRejectionSchema.safeParse(output.code);
        throw new InspectionError(reason.success ? reason.data : 'INVALID_MEDIA');
      }
      const { width, height } = output;
      if (
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1 ||
        width * height > MEDIA_LIMITS.imagePixels
      )
        throw new InspectionError('IMAGE_TOO_LARGE');
      const canonical = await this.storage.checksum(key);
      const thumbnail = await this.storage.checksum(thumbKey);
      if (canonical.byteLength > MEDIA_LIMITS.imageBytes || thumbnail.byteLength > 2 * 1024 * 1024)
        throw new InspectionError('IMAGE_TOO_LARGE');
      remaining();
      return {
        mimeType: mime,
        storageKey: key,
        ...canonical,
        width,
        height,
        durationSeconds: null,
        thumbnailKey: thumbKey,
        thumbnailBytes: thumbnail.byteLength,
        thumbnailSha256: thumbnail.sha256,
      };
    } catch (error) {
      for (const output of owned) {
        try {
          await this.storage.remove(output);
        } catch {
          console.error(
            JSON.stringify({ event: 'media.inspection.cleanup.failed', assetId: claim.id }),
          );
        }
      }
      if (error instanceof InspectionError) throw error;
      if (error instanceof Error && 'code' in error && error.code === 'INTEGRITY_MISMATCH')
        throw new InspectionError('INTEGRITY_MISMATCH');
      throw new InspectionError('INSPECTION_UNAVAILABLE');
    }
  }

  private parseJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new InspectionError('INVALID_MEDIA');
    }
  }
}
