import { describe, expect, it } from 'vitest';
import {
  commandAckSchema,
  deploymentCreateSchema,
  eventCreateSchema,
  overrideCreateSchema,
  scheduleBoardQuerySchema,
} from './schedules.js';

const id = '5f0d8c55-2a3b-4c1d-9e8f-0a1b2c3d4e5f';

describe('schedule contracts', () => {
  it('requires ordered windows and bounds board queries to 31 days', () => {
    const window = { deviceId: id, releaseId: id };
    expect(
      deploymentCreateSchema.parse({
        ...window,
        startsAt: '2026-09-27T04:15:00.000Z',
        endsAt: '2026-09-27T06:15:00.000Z',
      }).eventId,
    ).toBeNull();
    expect(
      deploymentCreateSchema.safeParse({
        ...window,
        startsAt: '2026-09-27T06:15:00.000Z',
        endsAt: '2026-09-27T06:15:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      scheduleBoardQuerySchema.safeParse({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-10-02T00:00:01.000Z',
      }).success,
    ).toBe(false);
  });

  it('defaults overrides to 30 minutes and caps them at 24 hours', () => {
    expect(overrideCreateSchema.parse({ releaseId: id })).toEqual({
      releaseId: id,
      minutes: 30,
      replaceOverrideId: null,
    });
    expect(overrideCreateSchema.safeParse({ releaseId: id, minutes: 1441 }).success).toBe(false);
  });

  it('rejects control characters and unknown time zones in events', () => {
    const event = { name: 'Open house — खुला दिवस', timezone: 'Asia/Kathmandu' };
    expect(eventCreateSchema.parse(event)).toMatchObject({ venue: '', suggestedStartsAt: null });
    expect(eventCreateSchema.safeParse({ ...event, name: 'Hall\u0000A' }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...event, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(
      eventCreateSchema.safeParse({
        ...event,
        suggestedStartsAt: '2026-09-27T06:00:00.000Z',
        suggestedEndsAt: '2026-09-27T05:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('accepts only coded acknowledgement reasons', () => {
    const ack = { commandId: id, appliedRevision: 3, result: 'REJECTED' };
    expect(commandAckSchema.parse({ ...ack, reason: 'CHECKSUM_MISMATCH' }).reason).toBe(
      'CHECKSUM_MISMATCH',
    );
    expect(commandAckSchema.safeParse({ ...ack, reason: 'free text' }).success).toBe(false);
  });
});
