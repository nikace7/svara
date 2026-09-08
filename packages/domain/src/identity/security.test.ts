import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  createToken,
  hashToken,
  csrfToken,
  verifyCsrf,
  sessionIsCurrent,
} from './security.js';
import { can, requirePermission } from './policies.js';

describe('identity security primitives', () => {
  it('salts password hashes, preserves Unicode and rejects wrong or malformed credentials', async () => {
    const password = 'मेरो सुरक्षित password 42';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('wrong password', first)).toBe(false);
    for (const bad of ['', 'scrypt$1$2$3', first + '$extra', first.replace('32768', '999999999')])
      expect(await verifyPassword(password, bad)).toBe(false);
    await expect(hashPassword('short')).rejects.toThrow();
    await expect(hashPassword('x'.repeat(129))).rejects.toThrow();
  });

  it('issues 256-bit opaque tokens and binds hashes and CSRF to secret purpose', () => {
    const pepper = randomBytes(48).toString('hex');
    const token = createToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(createToken()).not.toBe(token);
    expect(hashToken(token, pepper)).not.toBe(token);
    expect(hashToken(token, pepper)).not.toBe(hashToken(token, pepper + 'a'));
    const csrf = csrfToken(token, pepper);
    expect(csrf).not.toBe(hashToken(token, pepper));
    expect(verifyCsrf(token, csrf, pepper)).toBe(true);
    expect(verifyCsrf(createToken(), csrf, pepper)).toBe(false);
    expect(verifyCsrf(token, '', pepper)).toBe(false);
    expect(verifyCsrf(token, csrf + '=', pepper)).toBe(false);
    expect(() => hashToken('untrusted input', pepper)).toThrow();
    expect(() => hashToken(token, 'short')).toThrow();
  });

  it('expires at the exact absolute and idle boundaries, including clock anomalies', () => {
    const createdAt = new Date('2026-09-08T00:00:00Z');
    const lastSeenAt = new Date('2026-09-08T07:40:00Z');
    const expiresAt = new Date('2026-09-08T08:00:00Z');
    const session = { createdAt, lastSeenAt, expiresAt, revokedAt: null };
    expect(sessionIsCurrent(session, new Date('2026-09-08T07:59:59Z'))).toBe(true);
    expect(sessionIsCurrent(session, expiresAt)).toBe(false);
    expect(
      sessionIsCurrent({ ...session, lastSeenAt: createdAt }, new Date('2026-09-08T00:30:00Z')),
    ).toBe(false);
    expect(sessionIsCurrent({ ...session, revokedAt: createdAt }, lastSeenAt)).toBe(false);
    expect(sessionIsCurrent(session, createdAt)).toBe(false);
  });
});

describe('membership policies', () => {
  it('grants each role exactly its documented capabilities', () => {
    const permissions = [
      'manage_access',
      'author',
      'publish',
      'operate_devices',
      'manage_public_links',
      'inspect',
      'delete_transcripts',
    ] as const;
    const expected = {
      OWNER: [true, true, true, true, true, true, true],
      ADMINISTRATOR: [false, true, true, true, true, true, true],
      OPERATOR: [false, false, false, true, false, true, false],
      VIEWER: [false, false, false, false, false, true, false],
    };
    for (const role of ['OWNER', 'ADMINISTRATOR', 'OPERATOR', 'VIEWER'] as const)
      expect(permissions.map((permission) => can(role, permission))).toEqual(expected[role]);
    expect(() => requirePermission('VIEWER', 'publish')).toThrow('FORBIDDEN');
    expect(() => requirePermission('OWNER', 'manage_access')).not.toThrow();
  });
});
