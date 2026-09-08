import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadWorkspaceEnvironment } from '../../packages/config/src/server.js';
import { createDatabase } from '../../packages/database/src/index.js';
import { assertTestDatabase } from '../../packages/database/src/safety.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';

loadWorkspaceEnvironment();
const url = process.env.TEST_DATABASE_URL ?? '';
assertTestDatabase(url, 'test');
const db = createDatabase(url);
const pepper = randomBytes(48).toString('hex');
let now = new Date('2026-09-08T00:00:00Z');
const identity = new IdentityService(db, pepper, () => new Date(now));
const testSuffix = `${randomUUID()}@identity.example.test`;
const password = 'Synthetic demo password 42!';
const organisationIds: string[] = [];

async function register(label: string) {
  const result = await identity.register({
    email: `${label}-${testSuffix}`,
    displayName: label,
    organisationName: `Campus ${label}`,
    password,
  });
  organisationIds.push(result.identity.organisation.id);
  return result;
}

beforeAll(async () => {
  await db.$connect();
});
afterAll(async () => {
  await db.staffGrant.deleteMany({ where: { organisationId: { in: organisationIds } } });
  await db.staffSession.deleteMany({ where: { organisationId: { in: organisationIds } } });
  await db.auditEntry.deleteMany({ where: { organisationId: { in: organisationIds } } });
  await db.membership.deleteMany({ where: { organisationId: { in: organisationIds } } });
  await db.organisation.deleteMany({ where: { id: { in: organisationIds } } });
  await db.user.deleteMany({ where: { email: { endsWith: testSuffix } } });
  await db.$disconnect();
});

describe('staff identity on isolated PostgreSQL', () => {
  it('atomically registers an owner, rejects organisation injection, and stores only credential hashes', async () => {
    const owner = await register('register');
    expect(owner.identity.membership.role).toBe('OWNER');
    const session = await db.staffSession.findFirstOrThrow({
      where: { organisationId: owner.identity.organisation.id },
    });
    expect(JSON.stringify(session)).not.toContain(owner.token);
    expect(JSON.stringify(owner.identity)).not.toContain('passwordHash');
    expect(await identity.resolve(owner.token)).toMatchObject(owner.identity);
    const before = await db.organisation.count();
    await expect(
      identity.register({
        email: owner.identity.user.email.toUpperCase(),
        displayName: 'duplicate',
        organisationName: 'Orphan',
        password,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      identity.register({
        email: `inject-${testSuffix}`,
        displayName: 'inject',
        organisationName: 'inject',
        organisationId: owner.identity.organisation.id,
        password,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await db.organisation.count()).toBe(before);
  });

  it('rotates at login and organisation switch, rejects foreign membership and logs out idempotently', async () => {
    const owner = await register('rotation');
    const foreign = await register('foreign');
    const login = await identity.login({ email: owner.identity.user.email, password }, owner.token);
    expect(login.token).not.toBe(owner.token);
    await expect(identity.resolve(owner.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      identity.switchOrganisation(login.token, foreign.identity.organisation.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const switched = await identity.switchOrganisation(login.token, owner.identity.organisation.id);
    expect(switched.csrfToken).not.toBe(login.csrfToken);
    await expect(identity.resolve(login.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await identity.logout(switched.token);
    await identity.logout(switched.token);
    await expect(identity.resolve(switched.token)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    for (const email of [owner.identity.user.email, `missing-${testSuffix}`])
      await expect(identity.login({ email, password: 'incorrect password' })).rejects.toMatchObject(
        { code: 'UNAUTHENTICATED' },
      );
  });

  it('enforces idle and absolute expiry with a controllable server clock', async () => {
    const owner = await register('expiry');
    now = new Date(now.getTime() + 30 * 60 * 1000);
    await expect(identity.resolve(owner.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const login = await identity.login({ email: owner.identity.user.email, password });
    for (let i = 0; i < 16; i++) {
      now = new Date(now.getTime() + 29 * 60 * 1000);
      await identity.resolve(login.token);
    }
    now = new Date(login.expiresAt);
    await expect(identity.resolve(login.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('consumes an invitation once under a race and enforces tenant and role boundaries', async () => {
    const owner = await register('invite');
    const other = await register('invite-other');
    const invitation = await identity.invite(owner.token, {
      email: `member-${testSuffix}`,
      role: 'OPERATOR',
    });
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        identity.activate({ token: invitation.token, displayName: 'Member', password }),
      ),
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const member = await identity.login({ email: `member-${testSuffix}`, password });
    expect(member.identity.organisation.id).toBe(owner.identity.organisation.id);
    const members = await identity.listMembers(owner.token);
    expect(members).toHaveLength(2);
    expect(JSON.stringify(members)).not.toContain('passwordHash');
    await expect(
      identity.updateMember(other.token, member.identity.membership.id, {
        role: 'VIEWER',
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      identity.invite(member.token, { email: `forbidden-${testSuffix}`, role: 'OWNER' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await identity.updateMember(owner.token, member.identity.membership.id, {
      role: 'VIEWER',
      enabled: true,
    });
    await expect(identity.resolve(member.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const relogin = await identity.login({ email: member.identity.user.email, password });
    expect(relogin.identity.membership.role).toBe('VIEWER');
    await identity.updateMember(owner.token, member.identity.membership.id, {
      role: 'VIEWER',
      enabled: false,
    });
    await expect(identity.resolve(relogin.token)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(
      identity.login({ email: member.identity.user.email, password }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('never resets an existing account password through an invitation to another organisation', async () => {
    const first = await register('existing');
    const second = await register('second');
    const grant = await identity.invite(second.token, {
      email: first.identity.user.email,
      role: 'VIEWER',
    });
    await expect(
      identity.activate({
        token: grant.token,
        displayName: 'Attacker',
        password: 'Replacement password 42!',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await identity.activate({ token: grant.token, displayName: 'Existing', password });
    const switched = await identity.switchOrganisation(
      first.token,
      second.identity.organisation.id,
    );
    expect(switched.identity.membership.role).toBe('VIEWER');
    expect(switched.identity.user.displayName).toBe('existing');
  });

  it('preserves the last owner when two owners concurrently relinquish access', async () => {
    const owner = await register('last-owner');
    await expect(
      identity.updateMember(owner.token, owner.identity.membership.id, {
        role: 'VIEWER',
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' });
    const grant = await identity.invite(owner.token, {
      email: `coowner-${testSuffix}`,
      role: 'OWNER',
    });
    await identity.activate({ token: grant.token, displayName: 'Co-owner', password });
    const second = await identity.login({ email: `coowner-${testSuffix}`, password });
    const results = await Promise.allSettled(
      [owner, second].map((actor) =>
        identity.updateMember(actor.token, actor.identity.membership.id, {
          role: 'VIEWER',
          enabled: true,
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.membership.count({
        where: { organisationId: owner.identity.organisation.id, role: 'OWNER', enabled: true },
      }),
    ).toBe(1);
  });

  it('consumes recovery links once, rotates credentials and invalidates prior sessions and grants', async () => {
    const owner = await register('recovery');
    const grant = await identity.invite(owner.token, {
      email: `recover-member-${testSuffix}`,
      role: 'VIEWER',
    });
    await identity.activate({ token: grant.token, displayName: 'Recover Member', password });
    const member = await identity.login({ email: `recover-member-${testSuffix}`, password });
    const first = await identity.issueRecovery(owner.token, member.identity.membership.id);
    const replacement = await identity.issueRecovery(owner.token, member.identity.membership.id);
    const newPassword = 'A new synthetic password 42!';
    await expect(
      identity.recover({ token: first.token, password: newPassword }),
    ).rejects.toMatchObject({ code: 'INVALID_LINK' });
    await identity.recover({ token: replacement.token, password: newPassword });
    await expect(
      identity.recover({ token: replacement.token, password: newPassword }),
    ).rejects.toMatchObject({ code: 'INVALID_LINK' });
    await expect(identity.resolve(member.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      identity.login({ email: member.identity.user.email, password }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(
      (await identity.login({ email: member.identity.user.email, password: newPassword })).identity
        .user.id,
    ).toBe(member.identity.user.id);
  });

  it('expires links at 24 hours and rejects links from a revoked issuer', async () => {
    const owner = await register('link-expiry');
    const grant = await identity.invite(owner.token, {
      email: `expired-${testSuffix}`,
      role: 'VIEWER',
    });
    now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await expect(
      identity.activate({ token: grant.token, displayName: 'Expired', password }),
    ).rejects.toMatchObject({ code: 'INVALID_LINK' });
    const fresh = await identity.login({ email: owner.identity.user.email, password });
    const revoked = await identity.invite(fresh.token, {
      email: `revoked-${testSuffix}`,
      role: 'VIEWER',
    });
    await db.membership.update({
      where: { id: owner.identity.membership.id },
      data: { enabled: false },
    });
    await expect(
      identity.activate({ token: revoked.token, displayName: 'Revoked', password }),
    ).rejects.toMatchObject({ code: 'INVALID_LINK' });
  });

  it('rejects a cross-organisation session foreign key at the database boundary', async () => {
    const first = await register('fk-a');
    const second = await register('fk-b');
    await expect(
      db.staffSession.create({
        data: {
          tokenHash: randomUUID(),
          membershipId: first.identity.membership.id,
          organisationId: second.identity.organisation.id,
          expiresAt: new Date(now.getTime() + 1000),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('prevents one organisation owner from recovering an account shared with another tenant', async () => {
    const first = await register('recovery-scope-a');
    const second = await register('recovery-scope-b');
    const email = `shared-recovery-${testSuffix}`;
    const firstInvite = await identity.invite(first.token, { email, role: 'VIEWER' });
    await identity.activate({ token: firstInvite.token, displayName: 'Shared', password });
    const member = await identity.login({ email, password });
    const pending = await identity.issueRecovery(first.token, member.identity.membership.id);
    const secondInvite = await identity.invite(second.token, { email, role: 'VIEWER' });
    await identity.activate({ token: secondInvite.token, displayName: 'Shared', password });
    await expect(
      identity.issueRecovery(first.token, member.identity.membership.id),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      identity.recover({ token: pending.token, password: 'Tenant takeover password 42!' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await identity.login({ email, password })).identity.user.id).toBe(
      member.identity.user.id,
    );
  });

  it('validates organisation settings and records only safe audit categories and identifiers', async () => {
    const owner = await register('settings');
    await expect(
      identity.updateOrganisation(owner.token, { name: 'Changed', timezone: 'invalid/timezone' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const updated = await identity.updateOrganisation(owner.token, {
      name: 'हिमाल अध्ययन केन्द्र',
      timezone: 'Asia/Kathmandu',
    });
    expect(updated.name).toBe('हिमाल अध्ययन केन्द्र');
    const grant = await identity.invite(owner.token, {
      email: `settings-viewer-${testSuffix}`,
      role: 'VIEWER',
    });
    await identity.activate({ token: grant.token, displayName: 'Viewer', password });
    const viewer = await identity.login({ email: `settings-viewer-${testSuffix}`, password });
    await expect(
      identity.updateOrganisation(viewer.token, { name: 'Forbidden', timezone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const audit = await db.auditEntry.findMany({
      where: { organisationId: owner.identity.organisation.id },
    });
    expect(audit.some((entry) => entry.action === 'organisation.updated')).toBe(true);
    for (const secret of [owner.token, grant.token, password, owner.identity.user.email])
      expect(JSON.stringify(audit)).not.toContain(secret);
  });
});
