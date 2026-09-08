import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffFixture } from './staff-fixture.js';
import { seedLocalStaff, recoverLocalStaff } from '../../packages/domain/src/identity/local.js';
import { verifyPassword } from '../../packages/domain/src/identity/security.js';

describe('local staff provisioning and offline recovery', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  beforeAll(async () => {
    staff = await staffFixture();
  });
  afterAll(async () => {
    await staff.close();
  });
  it('seeds once and never restores changed passwords, names, roles or disabled access', async () => {
    const account = {
      id: randomUUID(),
      email: `seed-${staff.suffix}`,
      displayName: 'Seed Staff',
      password: staff.password,
      organisationId: staff.owner.identity.organisation.id,
      role: 'OPERATOR' as const,
    };
    expect(await seedLocalStaff(staff.db, [account])).toBe(1);
    const user = await staff.db.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(await verifyPassword(account.password, user.passwordHash)).toBe(true);
    await staff.db.user.update({
      where: { id: account.id },
      data: { displayName: 'Preserved name', passwordHash: 'preserved hash', disabled: true },
    });
    await staff.db.membership.updateMany({
      where: { userId: account.id },
      data: { role: 'VIEWER', enabled: false },
    });
    expect(await seedLocalStaff(staff.db, [account])).toBe(0);
    expect(await staff.db.user.findUnique({ where: { id: account.id } })).toMatchObject({
      passwordHash: 'preserved hash',
      displayName: 'Preserved name',
      disabled: true,
    });
    expect(await staff.db.membership.findFirst({ where: { userId: account.id } })).toMatchObject({
      role: 'VIEWER',
      enabled: false,
    });
  });
  it('cannot adopt a preexisting account with the same email into a seeded organisation', async () => {
    await expect(
      seedLocalStaff(staff.db, [
        {
          id: randomUUID(),
          email: staff.owner.identity.user.email,
          displayName: 'Attacker',
          password: staff.password,
          organisationId: staff.owner.identity.organisation.id,
          role: 'OWNER',
        },
      ]),
    ).rejects.toThrow('conflict');
    expect(
      await staff.db.membership.count({ where: { userId: staff.owner.identity.user.id } }),
    ).toBe(1);
  });
  it('recovers only the named user across memberships and revokes their sessions and grants', async () => {
    const other = await staff.service.register({
      email: `other-${staff.suffix}`,
      password: staff.password,
      displayName: 'Other Owner',
      organisationName: 'Other Organisation',
    });
    const grant = await staff.service.invite(other.token, {
      email: staff.owner.identity.user.email,
      role: 'VIEWER',
    });
    await staff.service.activate({
      token: grant.token,
      displayName: 'Owner',
      password: staff.password,
    });
    const link = await staff.service.invite(staff.owner.token, {
      email: `pending-${staff.suffix}`,
      role: 'VIEWER',
    });
    const newPassword = 'Recovered local password 43!';
    await recoverLocalStaff(staff.db, staff.owner.identity.user.email, newPassword);
    await expect(staff.service.resolve(staff.owner.token)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(staff.service.resolve(other.token)).resolves.toMatchObject({
      organisation: { id: other.identity.organisation.id },
    });
    await expect(
      staff.service.activate({
        token: link.token,
        displayName: 'Pending',
        password: staff.password,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_LINK' });
    await expect(
      staff.service.login({ email: staff.owner.identity.user.email, password: staff.password }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      staff.service.login({ email: staff.owner.identity.user.email, password: newPassword }),
    ).resolves.toBeDefined();
    const audit = await staff.db.auditEntry.findMany({
      where: { action: 'password.recovered.local', targetId: staff.owner.identity.user.id },
    });
    expect(audit).toHaveLength(2);
    expect(
      audit.every((entry) => entry.actorKind === 'LOCAL' && entry.actorMembershipId === null),
    ).toBe(true);
  });
  it('never re-enables a disabled account as a side effect of recovery', async () => {
    await staff.db.user.update({
      where: { id: staff.owner.identity.user.id },
      data: { disabled: true },
    });
    await recoverLocalStaff(staff.db, staff.owner.identity.user.email, staff.password);
    await expect(
      staff.service.login({ email: staff.owner.identity.user.email, password: staff.password }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      recoverLocalStaff(staff.db, `missing-${staff.suffix}`, staff.password),
    ).rejects.toThrow('not found');
  });
});
