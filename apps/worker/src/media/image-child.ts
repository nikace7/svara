import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import sharp from 'sharp';
import { MEDIA_LIMITS, mediaRejectionSchema } from '@svara/contracts';
import { detectMediaMime, InspectionError } from './policy.js';

async function writeOutput(path: string, bytes: Buffer) {
  // The supervisor owns these newly created, unique lease files. Never follow links.
  const handle = await open(path, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== 0)
      throw new InspectionError('INTEGRITY_MISMATCH');
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function inspectImage() {
  const [input, output, thumbnail, mime, length, checksum] = process.argv.slice(2);
  if (
    !input ||
    !output ||
    !thumbnail ||
    !length ||
    !checksum ||
    !['image/png', 'image/jpeg'].includes(mime ?? '')
  )
    throw new InspectionError('INVALID_MEDIA');
  const handle = await open(input, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.size < 1 ||
      stat.size > MEDIA_LIMITS.imageBytes ||
      stat.size !== Number(length)
    )
      throw new InspectionError('INTEGRITY_MISMATCH');
    bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) throw new InspectionError('INTEGRITY_MISMATCH');
      offset += read.bytesRead;
    }
    if (createHash('sha256').update(bytes).digest('hex') !== checksum)
      throw new InspectionError('INTEGRITY_MISMATCH');
  } finally {
    await handle.close();
  }
  if (detectMediaMime(bytes) !== mime) throw new InspectionError('UNSUPPORTED_FORMAT');
  sharp.cache(false);
  sharp.concurrency(1);
  const image = sharp(bytes, {
    failOn: 'warning',
    limitInputPixels: MEDIA_LIMITS.imagePixels,
    limitInputChannels: 4,
  });
  const metadata = await image.metadata();
  if ((metadata.pages ?? 1) !== 1 || !['png', 'jpeg'].includes(metadata.format ?? ''))
    throw new InspectionError('INVALID_MEDIA');
  const oriented = image.autoOrient().toColourspace('srgb').timeout({ seconds: 10 });
  const canonical = await (
    mime === 'image/png' ? oriented.png() : oriented.jpeg({ quality: 90 })
  ).toBuffer({ resolveWithObject: true });
  if (canonical.data.length > MEDIA_LIMITS.imageBytes) throw new InspectionError('IMAGE_TOO_LARGE');
  const preview = await sharp(canonical.data, { limitInputPixels: MEDIA_LIMITS.imagePixels })
    .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
    .png()
    .timeout({ seconds: 5 })
    .toBuffer();
  if (preview.length > 2 * 1024 * 1024) throw new InspectionError('IMAGE_TOO_LARGE');
  await writeOutput(output, canonical.data);
  await writeOutput(thumbnail, preview);
  return { width: canonical.info.width, height: canonical.info.height };
}

try {
  process.stdout.write(JSON.stringify({ ok: true, ...(await inspectImage()) }));
} catch (error) {
  const code =
    error instanceof InspectionError
      ? error.code
      : error instanceof Error && error.message.includes('pixel limit')
        ? 'IMAGE_TOO_LARGE'
        : 'INVALID_MEDIA';
  process.stdout.write(JSON.stringify({ ok: false, code: mediaRejectionSchema.parse(code) }));
}
