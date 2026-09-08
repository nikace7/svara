import type { Prisma, PrismaClient } from '@svara/database';
import {
  activateInputSchema,
  inviteInputSchema,
  loginInputSchema,
  memberUpdateSchema,
  organisationInputSchema,
  recoverInputSchema,
  registerInputSchema,
  resourceIdSchema,
} from '@svara/contracts';
import { IdentityError } from './errors.js';
import { requirePermission } from './policies.js';
import type { Permission, StaffRole } from './policies.js';
import {
  createToken,
  csrfToken,
  hashPassword,
  hashToken,
  sessionIsCurrent,
  sessionMilliseconds,
  verifyPassword,
} from './security.js';

type Transaction = Prisma.TransactionClient;
type Member = Prisma.MembershipGetPayload<{ include: { user: true; organisation: true } }>;
type Actor = { member: Member; sessionId: string };
export interface SafeMember {
  id: string;
  role: StaffRole;
  enabled: boolean;
  user: { id: string; email: string; displayName: string };
}
export interface SafeIdentity {
  user: SafeMember['user'];
  membership: { id: string; role: StaffRole };
  organisation: { id: string; name: string; timezone: string };
  memberships: { id: string; role: StaffRole; organisation: { id: string; name: string } }[];
}
export interface IssuedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
  identity: SafeIdentity;
}
const memberInclude = { user: true, organisation: true } as const;
const linkMilliseconds = 24 * 60 * 60 * 1000;
let dummyPassword: Promise<string> | undefined;

function input<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_INPUT');
  return result.data;
}

function isDatabaseError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isTransactionConflict(error: unknown): boolean {
  if (isDatabaseError(error, 'P2034')) return true;
  // The pg adapter can reject COMMIT before Prisma wraps the error as P2034.
  return (
    error instanceof Error &&
    error.name === 'DriverAdapterError' &&
    typeof error.cause === 'object' &&
    error.cause !== null &&
    'kind' in error.cause &&
    error.cause.kind === 'TransactionWriteConflict'
  );
}

function safeMember(member: Member): SafeMember {
  return {
    id: member.id,
    role: member.role,
    enabled: member.enabled,
    user: { id: member.user.id, email: member.user.email, displayName: member.user.displayName },
  };
}

/** All authority is resolved from a current session inside the same transaction as the operation. */
export class IdentityService {
  constructor(
    private readonly db: PrismaClient,
    private readonly pepper: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    if (pepper.length < 64) throw new Error('Identity requires a configured token pepper.');
  }

  private async transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(run, {
          isolationLevel: 'Serializable',
          maxWait: 5000,
          timeout: 10000,
        });
      } catch (error) {
        if (isTransactionConflict(error) && attempt < 3) continue;
        if (isDatabaseError(error, 'P2002')) throw new IdentityError('CONFLICT');
        throw error;
      }
    }
  }

  private async actor(tx: Transaction, token: string, touch = true): Promise<Actor> {
    const session = await tx.staffSession.findUnique({
      where: { tokenHash: hashToken(token, this.pepper) },
      include: { membership: { include: memberInclude } },
    });
    const now = this.clock();
    if (
      !session ||
      !sessionIsCurrent(session, now) ||
      !session.membership.enabled ||
      session.membership.user.disabled
    )
      throw new IdentityError('UNAUTHENTICATED');
    if (touch)
      await tx.staffSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    return { member: session.membership, sessionId: session.id };
  }

  /** Shared domain entrypoint: resolve current staff and execute under one transaction. */
  async asStaff<T>(
    token: string,
    permission: Permission,
    run: (tx: Transaction, actor: Actor) => Promise<T>,
    touch = true,
  ): Promise<T> {
    return this.transaction(async (tx) => {
      const actor = await this.actor(tx, token, touch);
      requirePermission(actor.member.role, permission);
      return run(tx, actor);
    });
  }

  private async safeIdentity(tx: Transaction, member: Member): Promise<SafeIdentity> {
    const memberships = await tx.membership.findMany({
      where: { userId: member.userId, enabled: true },
      include: { organisation: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      user: safeMember(member).user,
      membership: { id: member.id, role: member.role },
      organisation: {
        id: member.organisation.id,
        name: member.organisation.name,
        timezone: member.organisation.timezone,
      },
      memberships: memberships.map((item) => ({
        id: item.id,
        role: item.role,
        organisation: { id: item.organisation.id, name: item.organisation.name },
      })),
    };
  }

  private async issueSession(tx: Transaction, member: Member): Promise<IssuedSession> {
    const token = createToken();
    const now = this.clock();
    const expiresAt = new Date(now.getTime() + sessionMilliseconds);
    await tx.staffSession.create({
      data: {
        tokenHash: hashToken(token, this.pepper),
        membershipId: member.id,
        organisationId: member.organisationId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
      },
    });
    return {
      token,
      csrfToken: csrfToken(token, this.pepper),
      expiresAt,
      identity: await this.safeIdentity(tx, member),
    };
  }

  private async audit(tx: Transaction, member: Member, action: string, targetId: string) {
    await tx.auditEntry.create({
      data: {
        organisationId: member.organisationId,
        actorMembershipId: member.id,
        action,
        targetId,
        createdAt: this.clock(),
      },
    });
  }

  private async revokeUser(tx: Transaction, userId: string) {
    await tx.staffSession.updateMany({
      where: { membership: { userId }, revokedAt: null },
      data: { revokedAt: this.clock() },
    });
  }

  private async requireRecoveryScope(tx: Transaction, issuer: Member, target: Member) {
    // A tenant owner cannot reset credentials that also unlock a different tenant.
    // An authenticated owner may recover their own account.
    if (
      issuer.userId !== target.userId &&
      (await tx.membership.count({
        where: { userId: target.userId, organisationId: { not: issuer.organisationId } },
      })) > 0
    )
      throw new IdentityError('CONFLICT');
  }

  async register(value: unknown) {
    const data = input(registerInputSchema, value);
    const passwordHash = await hashPassword(data.password);
    return this.transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: data.email, displayName: data.displayName, passwordHash },
      });
      const organisation = await tx.organisation.create({ data: { name: data.organisationName } });
      const member = await tx.membership.create({
        data: { userId: user.id, organisationId: organisation.id, role: 'OWNER' },
        include: memberInclude,
      });
      await this.audit(tx, member, 'organisation.registered', organisation.id);
      return this.issueSession(tx, member);
    });
  }

  async login(value: unknown, previousToken?: string) {
    const data = input(loginInputSchema, value);
    const candidate = await this.db.user.findUnique({ where: { email: data.email } });
    dummyPassword ??= hashPassword(createToken());
    const correct = await verifyPassword(
      data.password,
      candidate?.passwordHash ?? (await dummyPassword),
    );
    if (!candidate || !correct || candidate.disabled) throw new IdentityError('UNAUTHENTICATED');
    return this.transaction(async (tx) => {
      const member = await tx.membership.findFirst({
        where: {
          userId: candidate.id,
          enabled: true,
          user: { disabled: false, passwordHash: candidate.passwordHash },
        },
        include: memberInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!member) throw new IdentityError('UNAUTHENTICATED');
      if (previousToken && /^[A-Za-z0-9_-]{43}$/.test(previousToken))
        await tx.staffSession.updateMany({
          where: { tokenHash: hashToken(previousToken, this.pepper) },
          data: { revokedAt: this.clock() },
        });
      await this.audit(tx, member, 'session.login', member.userId);
      return this.issueSession(tx, member);
    });
  }

  async resolve(token: string, touch = true) {
    return this.transaction(async (tx) =>
      this.safeIdentity(tx, (await this.actor(tx, token, touch)).member),
    );
  }

  async logout(token: string): Promise<void> {
    await this.db.staffSession.updateMany({
      where: { tokenHash: hashToken(token, this.pepper), revokedAt: null },
      data: { revokedAt: this.clock() },
    });
  }

  async switchOrganisation(token: string, organisationId: string) {
    input(resourceIdSchema, organisationId);
    return this.transaction(async (tx) => {
      const actor = await this.actor(tx, token);
      const member = await tx.membership.findFirst({
        where: { userId: actor.member.userId, organisationId, enabled: true },
        include: memberInclude,
      });
      if (!member) throw new IdentityError('NOT_FOUND');
      await tx.staffSession.update({
        where: { id: actor.sessionId },
        data: { revokedAt: this.clock() },
      });
      return this.issueSession(tx, member);
    });
  }

  async listMembers(token: string) {
    return this.transaction(async (tx) => {
      const { member } = await this.actor(tx, token);
      return (
        await tx.membership.findMany({
          where: { organisationId: member.organisationId },
          include: memberInclude,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      ).map(safeMember);
    });
  }

  async updateMember(token: string, id: string, value: unknown) {
    input(resourceIdSchema, id);
    const data = input(memberUpdateSchema, value);
    return this.transaction(async (tx) => {
      const { member } = await this.actor(tx, token);
      const target = await tx.membership.findFirst({
        where: { id, organisationId: member.organisationId },
        include: memberInclude,
      });
      if (!target) throw new IdentityError('NOT_FOUND');
      requirePermission(member.role, 'manage_access');
      if (target.role === 'OWNER' && target.enabled && (!data.enabled || data.role !== 'OWNER')) {
        const owners = await tx.membership.count({
          where: {
            organisationId: member.organisationId,
            role: 'OWNER',
            enabled: true,
            user: { disabled: false },
          },
        });
        if (owners <= 1) throw new IdentityError('LAST_OWNER');
      }
      const changed = await tx.membership.update({
        where: { id: target.id },
        data,
        include: memberInclude,
      });
      await this.revokeUser(tx, target.userId);
      await tx.staffGrant.deleteMany({
        where: { OR: [{ issuerMembershipId: target.id }, { targetMembershipId: target.id }] },
      });
      await this.audit(tx, member, 'member.updated', target.id);
      return safeMember(changed);
    });
  }

  async updateOrganisation(token: string, value: unknown) {
    const data = input(organisationInputSchema, value);
    return this.transaction(async (tx) => {
      const { member } = await this.actor(tx, token);
      requirePermission(member.role, 'manage_access');
      const organisation = await tx.organisation.update({
        where: { id: member.organisationId },
        data,
      });
      await this.audit(tx, member, 'organisation.updated', organisation.id);
      return { id: organisation.id, name: organisation.name, timezone: organisation.timezone };
    });
  }

  async invite(token: string, value: unknown) {
    const data = input(inviteInputSchema, value);
    return this.transaction(async (tx) => {
      const { member } = await this.actor(tx, token);
      requirePermission(member.role, 'manage_access');
      if (
        await tx.membership.findFirst({
          where: { organisationId: member.organisationId, user: { email: data.email } },
        })
      )
        throw new IdentityError('CONFLICT');
      await tx.staffGrant.deleteMany({
        where: {
          organisationId: member.organisationId,
          email: data.email,
          purpose: 'INVITATION',
          consumedAt: null,
        },
      });
      return this.issueGrant(tx, member, 'INVITATION', data.email, data.role, null);
    });
  }

  async issueRecovery(token: string, id: string) {
    input(resourceIdSchema, id);
    return this.transaction(async (tx) => {
      const { member } = await this.actor(tx, token);
      const target = await tx.membership.findFirst({
        where: {
          id,
          organisationId: member.organisationId,
          enabled: true,
          user: { disabled: false },
        },
        include: memberInclude,
      });
      if (!target) throw new IdentityError('NOT_FOUND');
      requirePermission(member.role, 'manage_access');
      await this.requireRecoveryScope(tx, member, target);
      await tx.staffGrant.deleteMany({
        where: { purpose: 'RECOVERY', target: { userId: target.userId }, consumedAt: null },
      });
      return this.issueGrant(tx, member, 'RECOVERY', target.user.email, null, target.id);
    });
  }

  private async issueGrant(
    tx: Transaction,
    member: Member,
    purpose: 'INVITATION' | 'RECOVERY',
    email: string,
    role: Member['role'] | null,
    targetMembershipId: string | null,
  ) {
    const token = createToken();
    const createdAt = this.clock();
    const expiresAt = new Date(createdAt.getTime() + linkMilliseconds);
    const grant = await tx.staffGrant.create({
      data: {
        tokenHash: hashToken(token, this.pepper),
        purpose,
        email,
        role,
        organisationId: member.organisationId,
        issuerMembershipId: member.id,
        targetMembershipId,
        createdAt,
        expiresAt,
      },
    });
    await this.audit(
      tx,
      member,
      purpose === 'INVITATION' ? 'invitation.created' : 'recovery.created',
      grant.id,
    );
    return { token, expiresAt };
  }

  private async consumeGrant(tx: Transaction, token: string, purpose: 'INVITATION' | 'RECOVERY') {
    const grant = await tx.staffGrant.findUnique({
      where: { tokenHash: hashToken(token, this.pepper) },
      include: { issuer: { include: memberInclude }, target: { include: memberInclude } },
    });
    const now = this.clock();
    if (
      !grant ||
      grant.purpose !== purpose ||
      grant.consumedAt ||
      grant.expiresAt <= now ||
      grant.createdAt > now ||
      !grant.issuer.enabled ||
      grant.issuer.role !== 'OWNER' ||
      grant.issuer.user.disabled
    )
      throw new IdentityError('INVALID_LINK');
    const consumed = await tx.staffGrant.updateMany({
      where: { id: grant.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw new IdentityError('INVALID_LINK');
    return grant;
  }

  async activate(value: unknown): Promise<void> {
    const data = input(activateInputSchema, value);
    const candidate = await this.db.staffGrant.findUnique({
      where: { tokenHash: hashToken(data.token, this.pepper) },
    });
    if (!candidate || candidate.purpose !== 'INVITATION') throw new IdentityError('INVALID_LINK');
    const existing = await this.db.user.findUnique({ where: { email: candidate.email } });
    // An invitation adds membership. It can never serve as password recovery for an existing account.
    if (
      existing &&
      (existing.disabled || !(await verifyPassword(data.password, existing.passwordHash)))
    )
      throw new IdentityError('UNAUTHENTICATED');
    const passwordHash = existing?.passwordHash ?? (await hashPassword(data.password));
    await this.transaction(async (tx) => {
      const grant = await this.consumeGrant(tx, data.token, 'INVITATION');
      if (!grant.role) throw new IdentityError('INVALID_LINK');
      let user = await tx.user.findUnique({ where: { email: grant.email } });
      if (user) {
        if (
          !existing ||
          user.id !== existing.id ||
          user.passwordHash !== passwordHash ||
          user.disabled
        )
          throw new IdentityError('UNAUTHENTICATED');
      } else {
        if (existing) throw new IdentityError('INVALID_LINK');
        user = await tx.user.create({
          data: { email: grant.email, displayName: data.displayName, passwordHash },
        });
      }
      const member = await tx.membership.create({
        data: { userId: user.id, organisationId: grant.organisationId, role: grant.role },
        include: memberInclude,
      });
      await this.audit(tx, grant.issuer, 'invitation.activated', member.id);
    });
  }

  async recover(value: unknown): Promise<void> {
    const data = input(recoverInputSchema, value);
    const passwordHash = await hashPassword(data.password);
    await this.transaction(async (tx) => {
      const grant = await this.consumeGrant(tx, data.token, 'RECOVERY');
      if (!grant.target?.enabled || grant.target.user.disabled)
        throw new IdentityError('INVALID_LINK');
      await this.requireRecoveryScope(tx, grant.issuer, grant.target);
      await tx.user.update({ where: { id: grant.target.userId }, data: { passwordHash } });
      await this.revokeUser(tx, grant.target.userId);
      await tx.staffGrant.deleteMany({
        where: {
          OR: [
            { target: { userId: grant.target.userId } },
            { issuer: { userId: grant.target.userId } },
          ],
        },
      });
      await this.audit(tx, grant.issuer, 'password.recovered', grant.target.userId);
    });
  }
}
