import { describe, expect, it } from 'vitest';
import {
  activateInputSchema,
  inviteInputSchema,
  loginInputSchema,
  memberUpdateSchema,
  organisationInputSchema,
  recoverInputSchema,
  registerInputSchema,
  resourceIdSchema,
} from './identity.js';

describe('staff input contracts', () => {
  it('normalizes email and names while preserving password bytes and Nepali text', () => {
    const password = '  मेरो password ४२  ';
    expect(
      registerInputSchema.parse({
        email: ' Owner@Example.test ',
        displayName: ' नमस्ते ',
        organisationName: ' हिमाल ',
        password,
      }),
    ).toEqual({
      email: 'owner@example.test',
      displayName: 'नमस्ते',
      organisationName: 'हिमाल',
      password,
    });
    expect(loginInputSchema.parse({ email: 'OWNER@example.test', password: 'old' }).password).toBe(
      'old',
    );
  });

  it('rejects missing, oversized, malformed and authority-injecting input', () => {
    const base = {
      email: 'owner@example.test',
      displayName: 'Owner',
      organisationName: 'Campus',
      password: 'synthetic password',
    };
    for (const overrides of [
      { email: 'invalid' },
      { password: 'short' },
      { password: 'x'.repeat(129) },
      { organisationName: ' ' },
      { displayName: 'x'.repeat(161) },
      { role: 'OWNER' },
      { organisationId: 'chosen-by-client' },
    ])
      expect(registerInputSchema.safeParse({ ...base, ...overrides }).success).toBe(false);
    expect(
      inviteInputSchema.safeParse({ email: 'member@example.test', role: 'SUPERUSER' }).success,
    ).toBe(false);
    expect(memberUpdateSchema.safeParse({ role: 'VIEWER', enabled: 'false' }).success).toBe(false);
    expect(memberUpdateSchema.parse({ role: 'VIEWER', enabled: false })).toEqual({
      role: 'VIEWER',
      enabled: false,
    });
    expect(resourceIdSchema.safeParse('../another-tenant').success).toBe(false);
  });

  it('checks activation and recovery tokens and real IANA timezones', () => {
    const token = 'a'.repeat(43);
    expect(
      activateInputSchema.parse({ token, displayName: 'Staff', password: 'synthetic password' })
        .token,
    ).toBe(token);
    expect(recoverInputSchema.parse({ token, password: 'synthetic password' }).token).toBe(token);
    expect(
      recoverInputSchema.safeParse({ token: token + '=', password: 'synthetic password' }).success,
    ).toBe(false);
    expect(
      organisationInputSchema.parse({ name: 'Campus', timezone: 'Asia/Kathmandu' }).timezone,
    ).toBe('Asia/Kathmandu');
    expect(
      organisationInputSchema.safeParse({ name: 'Campus', timezone: 'not/a-zone' }).success,
    ).toBe(false);
  });
});
