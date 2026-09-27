import { describe, expect, it } from 'vitest';
import { formatZoned, fromZonedInput, startOfZonedDay, toZonedInput } from './zoned-time.js';

describe('organisation time zone conversion', () => {
  it('reads and writes Kathmandu wall time at its +05:45 offset', () => {
    expect(fromZonedInput('2026-09-27T10:00', 'Asia/Kathmandu')).toBe('2026-09-27T04:15:00.000Z');
    expect(toZonedInput('2026-09-27T04:15:00.000Z', 'Asia/Kathmandu')).toBe('2026-09-27T10:00');
    expect(
      startOfZonedDay(new Date('2026-09-26T20:00:00.000Z'), 'Asia/Kathmandu').toISOString(),
    ).toBe('2026-09-26T18:15:00.000Z');
  });

  it('settles daylight-saving edges and rejects malformed input', () => {
    expect(fromZonedInput('2026-03-08T01:30', 'America/New_York')).toBe('2026-03-08T06:30:00.000Z');
    expect(fromZonedInput('2026-03-08T03:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
    expect(toZonedInput('2026-11-01T12:00:00.000Z', 'America/New_York')).toBe('2026-11-01T07:00');
    expect(fromZonedInput('2026-09-27 10:00', 'Asia/Kathmandu')).toBeNull();
  });

  it('formats in the organisation zone, not the browser zone', () => {
    expect(formatZoned('2026-09-27T04:15:00.000Z', 'Asia/Kathmandu', { timeStyle: 'short' })).toBe(
      '10:00',
    );
  });
});
