import type { PrismaClient } from '@svara/database';
import { loginInputSchema } from '@svara/contracts';
import type { staffRoleSchema } from '@svara/contracts';
import { hashPassword } from './security.js';

export interface DemoStaffAccount {
  id: string;
  email: string;
  displayName: string;
  organisationId: string;
  role: (typeof staffRoleSchema.options)[number];
  password: string;
}

/** CLI-only capability. The caller must check the local DB target and application marker. */
export async function seedLocalStaff(
  db: PrismaClient,
  accounts: readonly DemoStaffAccount[],
): Promise<number> {
  const prepared: (DemoStaffAccount & { passwordHash: string })[] = [];
  for (const account of accounts)
    prepared.push({ ...account, passwordHash: await hashPassword(account.password) });
  return db.$transaction(
    async (tx) => {
      let created = 0;
      for (const account of prepared) {
        const existing = await tx.user.findFirst({
          where: { OR: [{ id: account.id }, { email: account.email }] },
        });
        if (existing) {
          if (existing.id !== account.id || existing.email !== account.email)
            throw new Error(
              'Demo account conflict: refusing to adopt or overwrite an existing identity.',
            );
          continue;
        }
        await tx.user.create({
          data: {
            id: account.id,
            email: account.email,
            displayName: account.displayName,
            passwordHash: account.passwordHash,
            memberships: { create: { organisationId: account.organisationId, role: account.role } },
          },
        });
        await tx.auditEntry.create({
          data: {
            organisationId: account.organisationId,
            actorKind: 'LOCAL',
            action: 'staff.seeded.local',
            targetId: account.id,
          },
        });
        created++;
      }
      return created;
    },
    { isolationLevel: 'Serializable' },
  );
}

/** Explicit offline administration only; this function is never exposed through an HTTP route. */
export async function recoverLocalStaff(
  db: PrismaClient,
  email: string,
  password: string,
): Promise<void> {
  const input = loginInputSchema.safeParse({ email, password });
  if (!input.success) throw new Error('Enter a valid recovery email and password.');
  const passwordHash = await hashPassword(password);
  await db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { email: input.data.email },
        include: { memberships: true },
      });
      if (!user) throw new Error('Local recovery account not found.');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.staffSession.updateMany({
        where: { membership: { userId: user.id }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.staffGrant.deleteMany({
        where: {
          OR: [
            { email: user.email },
            { issuer: { userId: user.id } },
            { target: { userId: user.id } },
          ],
        },
      });
      for (const membership of user.memberships)
        await tx.auditEntry.create({
          data: {
            organisationId: membership.organisationId,
            actorKind: 'LOCAL',
            action: 'password.recovered.local',
            targetId: user.id,
          },
        });
    },
    { isolationLevel: 'Serializable' },
  );
}
