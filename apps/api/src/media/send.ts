import { pipeline } from 'node:stream/promises';
import type { FileHandle } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { parseMediaRange } from '@svara/domain';

/** Streams one ready media file with byte ranges, ETag and safe headers, then closes it. */
export async function sendMediaFile(
  request: Request,
  response: Response,
  id: string,
  file: {
    handle: FileHandle;
    byteLength: number;
    sha256: string;
    mimeType: string;
    filename: string;
  },
): Promise<void> {
  try {
    const etag = `"${file.sha256}"`;
    const requested =
      !request.headers['if-range'] || request.headers['if-range'] === etag
        ? request.headers.range
        : undefined;
    response.setHeader('Content-Range', `bytes */${file.byteLength}`);
    const range = parseMediaRange(requested, file.byteLength);
    response.removeHeader('Content-Range');
    response.status(range.partial ? 206 : 200);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(range.end - range.start + 1));
    response.setHeader('ETag', etag);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const name = encodeURIComponent(file.filename).replace(
      /[!'()*]/g,
      (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    response.setHeader('Content-Disposition', `inline; filename="media"; filename*=UTF-8''${name}`);
    if (range.partial)
      response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.byteLength}`);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    try {
      await pipeline(
        file.handle.createReadStream({ start: range.start, end: range.end, autoClose: true }),
        response,
      );
    } catch {
      // The response may already have streamed bytes; never append an error envelope.
      if (!response.destroyed) response.destroy();
      console.error(JSON.stringify({ event: 'media.response.interrupted', assetId: id }));
    }
  } finally {
    await file.handle.close();
  }
}
