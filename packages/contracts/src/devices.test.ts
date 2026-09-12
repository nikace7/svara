import { describe, expect, it } from 'vitest';
import {
  deviceCreateSchema,
  deviceSaveSchema,
  deviceListSchema,
  devicePairSchema,
  deviceTicketSchema,
} from './devices.js';

describe('device boundary contracts', () => {
  it('bounds names, capabilities and revisions without accepting tenant authority', () => {
    expect(deviceCreateSchema.parse({ name: ' Lobby kiosk ' }).name).toBe('Lobby kiosk');
    for (const value of [
      { name: '' },
      { name: 'x'.repeat(121) },
      { name: 'Lobby', organisationId: '10000000-0000-4000-8000-000000000001' },
      { name: 'Lobby', capabilities: { microphone: 'true' } },
    ])
      expect(deviceCreateSchema.safeParse(value).success).toBe(false);
    const base = {
      name: 'Lobby',
      enabled: true,
      maintenanceMode: false,
      capabilities: { microphone: true, speaker: true, secondaryDisplay: true },
    };
    expect(deviceSaveSchema.safeParse(base).success).toBe(false);
    expect(deviceSaveSchema.safeParse({ ...base, expectedRevision: 1 }).success).toBe(true);
    expect(deviceSaveSchema.safeParse({ ...base, expectedRevision: 0 }).success).toBe(false);
  });

  it('uses a public challenge locator plus a bounded unambiguous code', () => {
    const challengeId = '10000000-0000-4000-8000-000000000001';
    expect(devicePairSchema.parse({ challengeId, code: ' ab23cd ' }).code).toBe('AB23CD');
    for (const code of ['ABC12D', 'ABO23D', 'ABC2345', 'ＡＢ23CD'])
      expect(devicePairSchema.safeParse({ challengeId, code }).success).toBe(false);
    expect(devicePairSchema.safeParse({ code: 'ABC234' }).success).toBe(false);
    expect(
      devicePairSchema.safeParse({ challengeId, code: 'ABC234', deviceId: challengeId }).success,
    ).toBe(false);
  });

  it('allows only device roles/namespaces and bounded cursor queries', () => {
    for (const role of ['PRIMARY', 'DISPLAY'])
      expect(deviceTicketSchema.safeParse({ namespace: '/devices', role }).success).toBe(true);
    for (const value of [
      { namespace: '/voice', role: 'PRIMARY' },
      { namespace: '/devices', role: 'OWNER' },
    ])
      expect(deviceTicketSchema.safeParse(value).success).toBe(false);
    expect(deviceListSchema.parse({})).toMatchObject({ limit: 25, search: '' });
    expect(deviceListSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(deviceListSchema.safeParse({ cursor: 'unbounded query' }).success).toBe(false);
  });
});
