import { MediaError } from './errors.js';

export function parseMediaRange(value: string | undefined, size: number) {
  if (!Number.isSafeInteger(size) || size < 1) throw new MediaError('INVALID_RANGE');
  if (value === undefined) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=([0-9]*)-([0-9]*)$/.exec(value);
  if (!match || value.length > 80 || (!match[1] && !match[2]))
    throw new MediaError('INVALID_RANGE');
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ([first, last].some((part) => part !== undefined && !Number.isSafeInteger(part)))
    throw new MediaError('INVALID_RANGE');
  if (first === undefined) {
    if (!last) throw new MediaError('INVALID_RANGE');
    return { start: Math.max(0, size - last), end: size - 1, partial: true };
  }
  if (first >= size || (last !== undefined && last < first)) throw new MediaError('INVALID_RANGE');
  return { start: first, end: Math.min(last ?? size - 1, size - 1), partial: true };
}
