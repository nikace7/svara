import { PassThrough } from 'node:stream';
import busboy from 'busboy';
import type { Request, Response } from 'express';
import { MEDIA_LIMITS, mediaUploadSchema } from '@svara/contracts';
import type { MediaDetail } from '@svara/contracts';
import { IdentityError, MediaError } from '@svara/domain';
import type { MediaService } from '@svara/domain';

type UploadService = Pick<MediaService, 'reserve' | 'receive'>;
const bodyLimit = MEDIA_LIMITS.videoBytes + 64 * 1024;
const invalid = () => new IdentityError('INVALID_INPUT');

/** Hold the file's end until the entire form is valid, so trailing parts cannot publish it. */
export async function receiveMultipart(
  request: Request,
  response: Response,
  service: UploadService,
  token: string,
): Promise<MediaDetail> {
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')
    throw invalid();
  const length = request.headers['content-length'];
  if (length && (!/^[0-9]+$/.test(length) || Number(length) > bodyLimit)) throw invalid();
  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({
      headers: request.headers,
      highWaterMark: 64 * 1024,
      fileHwm: 64 * 1024,
      limits: {
        fieldNameSize: 32,
        fieldSize: 2048,
        fields: 1,
        files: 1,
        parts: 3,
        fileSize: MEDIA_LIMITS.videoBytes + 1,
        headerPairs: 16,
      },
    });
  } catch {
    throw invalid();
  }
  const cancellation = new AbortController();
  const source = new PassThrough({ highWaterMark: 64 * 1024 });
  // A rejection can arrive while reservation is still awaiting its transaction.
  source.on('error', () => {});
  let failure: unknown;
  let metadata: ReturnType<typeof mediaUploadSchema.parse> | undefined;
  let files = 0;
  let total = 0;
  let task: Promise<MediaDetail | undefined> | undefined;
  const fail = (error: unknown) => {
    if (failure) return;
    failure = error;
    cancellation.abort();
    source.destroy(error instanceof Error ? error : invalid());
    // Do not destroy busboy reentrantly from its own file/field callback.
    queueMicrotask(() => parser.destroy());
  };
  const disconnected = () => fail(new MediaError('UPLOAD_INTERRUPTED'));
  const closed = () => {
    if (!response.writableFinished) disconnected();
  };
  const count = (chunk: Buffer) => {
    total += chunk.length;
    if (total > bodyLimit) fail(invalid());
  };
  const deadline = setTimeout(disconnected, MEDIA_LIMITS.uploadMs);
  request.once('aborted', disconnected);
  request.once('error', disconnected);
  response.once('close', closed);
  request.on('data', count);
  parser.on('error', () => fail(invalid()));
  parser.on('fieldsLimit', () => fail(invalid()));
  parser.on('filesLimit', () => fail(invalid()));
  parser.on('partsLimit', () => fail(invalid()));
  parser.on('field', (name, value, info) => {
    if (failure) return;
    if (name !== 'metadata' || metadata || files || info.nameTruncated || info.valueTruncated) {
      fail(invalid());
      return;
    }
    try {
      metadata = mediaUploadSchema.parse(JSON.parse(value));
    } catch {
      fail(invalid());
    }
  });
  parser.on('file', (name, file, info) => {
    file.on('error', () => fail(invalid()));
    file.on('limit', () => fail(new MediaError('UPLOAD_LENGTH_MISMATCH')));
    if (
      failure ||
      ++files !== 1 ||
      name !== 'file' ||
      !metadata ||
      info.mimeType !== metadata.mimeType ||
      !['7bit', '8bit', 'binary'].includes(info.encoding)
    ) {
      file.resume();
      fail(invalid());
      return;
    }
    const input = metadata;
    file.pipe(source, { end: false });
    task = (async () => {
      const entry = await service.reserve(token, input);
      return service.receive(token, entry.id, source, cancellation.signal);
    })().catch((error: unknown) => {
      fail(error);
      return undefined;
    });
  });
  const parsed = new Promise<void>((resolve) => {
    parser.once('close', () => {
      if (!failure && (!metadata || files !== 1)) fail(invalid());
      if (!failure) source.end();
      resolve();
    });
  });
  request.pipe(parser);
  try {
    await parsed;
    const result = await task;
    if (failure) throw failure;
    if (!result) throw invalid();
    return result;
  } finally {
    clearTimeout(deadline);
    request.unpipe(parser);
    request.off('data', count);
    request.off('aborted', disconnected);
    request.off('error', disconnected);
    response.off('close', closed);
    source.destroy();
    parser.destroy();
    if (!request.complete && !response.destroyed) {
      response.setHeader('Connection', 'close');
      response.once('finish', () => request.destroy());
    }
  }
}
