import { describe, expect, it } from 'vitest';
import { deviceUpdatedSchema, localeSchema } from './events.js';

const event = {
  v: 1,
  eventId: '10000000-0000-4000-8000-000000000001',
  occurredAt: '2026-09-08T10:00:00Z',
  correlationId: '10000000-0000-4000-8000-000000000002',
  deviceId: '10000000-0000-4000-8000-000000000003',
  revision: 1,
};

describe('versioned operations events', () => {
  it('accepts a version 1 invalidation hint', () => {
    expect(deviceUpdatedSchema.parse(event)).toEqual(event);
  });

  it.each([
    { v: 2 },
    { revision: -1 },
    { revision: 1.5 },
    { deviceId: 'not-a-uuid' },
    { occurredAt: 'yesterday' },
    { organisationId: event.deviceId },
  ])('rejects malformed or authority-widening payloads', (override) => {
    expect(deviceUpdatedSchema.safeParse({ ...event, ...override }).success).toBe(false);
  });

  it('supports only explicitly selected English and Nepali locales', () => {
    expect(localeSchema.options).toEqual(['en-US', 'ne-NP']);
    expect(localeSchema.safeParse('auto').success).toBe(false);
  });
});
