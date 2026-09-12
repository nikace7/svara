import { createHash } from 'node:crypto';
import type { Prisma } from '@svara/database';
import {
  RELEASE_LIMITS,
  idempotencyKeySchema,
  releaseCreateSchema,
  releaseDetailSchema,
  releaseListSchema,
  releaseSearchSchema,
  releaseSummarySchema,
  resourceIdSchema,
} from '@svara/contracts';
import type {
  ReleaseDetail,
  ReleasePage,
  ReleaseReadiness,
  ReleaseSnapshot,
} from '@svara/contracts';
import type { IdentityService } from '../identity/service.js';
import { IdentityError } from '../identity/errors.js';
import { AuthoringError } from './errors.js';
import { assembleRelease, releaseDraftInclude, releaseSnapshotHash } from './release-assembly.js';
import { ReleaseError } from './release-errors.js';
import { captureRelease } from './release-capture.js';
import { searchRelease } from './release-search.js';

export { releaseSnapshotHash } from './release-assembly.js';
type Transaction = Prisma.TransactionClient;
type Stored = Prisma.BotReleaseGetPayload<object>;
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
function parse<T>(schema: Schema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_INPUT');
  return result.data;
}
function mutation(value: unknown) {
  if (value && typeof value === 'object' && !('expectedRevision' in value))
    throw new AuthoringError('PRECONDITION_REQUIRED');
  return parse(releaseCreateSchema, value);
}
function metadata(release: Omit<Stored, 'snapshot'>) {
  return {
    id: release.id,
    botId: release.botId,
    botRevision: release.botRevision,
    kind: release.kind,
    version: release.version,
    providerMode: release.providerMode,
    snapshotHash: release.snapshotHash,
    createdAt: release.createdAt.toISOString(),
    previewExpiresAt: release.previewExpiresAt?.toISOString() ?? null,
  };
}
function detail(release: Stored): ReleaseDetail {
  const value = releaseDetailSchema.parse({ ...metadata(release), snapshot: release.snapshot });
  if (releaseSnapshotHash(value.snapshot) !== value.snapshotHash)
    throw new Error('Stored release hash does not match its snapshot.');
  return value;
}
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export class ReleaseService {
  private readonly clock: () => Date;
  private readonly providerMode: ReleaseSnapshot['providerMode'];
  constructor(
    private readonly identity: IdentityService,
    options: { providerMode: ReleaseSnapshot['providerMode']; clock?: () => Date },
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.providerMode = options.providerMode;
  }
  private async load(tx: Transaction, organisationId: string, id: string) {
    const release = await tx.botRelease.findFirst({ where: { id, organisationId } });
    if (!release) throw new IdentityError('NOT_FOUND');
    return release;
  }
  private async draft(
    tx: Transaction,
    organisationId: string,
    id: string,
    expectedRevision: number,
  ) {
    const bot = await tx.bot.findFirst({
      where: { id, organisationId },
      include: releaseDraftInclude,
    });
    if (!bot) throw new IdentityError('NOT_FOUND');
    if (bot.revision !== expectedRevision)
      throw new AuthoringError('REVISION_CONFLICT', bot.revision);
    if (bot.archivedAt) throw new AuthoringError('ARCHIVED', bot.revision);
    return bot;
  }
  async validate(token: string, botId: string, value: unknown): Promise<ReleaseReadiness> {
    parse(resourceIdSchema, botId);
    const input = mutation(value);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const bot = await this.draft(tx, member.organisationId, botId, input.expectedRevision);
        return assembleRelease(bot, this.providerMode).readiness;
      },
      false,
    );
  }
  async get(token: string, id: string): Promise<ReleaseDetail> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => detail(await this.load(tx, member.organisationId, id)),
      false,
    );
  }
  async list(token: string, botId: string, value: unknown): Promise<ReleasePage> {
    parse(resourceIdSchema, botId);
    const input = parse(releaseListSchema, value);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        if (
          !(await tx.bot.findFirst({
            where: { id: botId, organisationId: member.organisationId },
            select: { id: true },
          }))
        )
          throw new IdentityError('NOT_FOUND');
        const where = {
          botId,
          organisationId: member.organisationId,
          ...(input.kind !== 'ALL' ? { kind: input.kind } : {}),
        };
        const total = await tx.botRelease.count({ where });
        const rows = await tx.botRelease.findMany({
          where,
          omit: { snapshot: true },
          orderBy: [{ createdAt: 'desc' }, { version: 'desc' }, { id: 'desc' }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        });
        return {
          items: rows.map((row) => releaseSummarySchema.parse(metadata(row))),
          total,
          page: input.page,
          pageSize: input.pageSize,
        };
      },
      false,
    );
  }
  async search(token: string, id: string, value: unknown) {
    parse(resourceIdSchema, id);
    const input = parse(releaseSearchSchema, value);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const release = await this.load(tx, member.organisationId, id);
        if (release.previewExpiresAt && release.previewExpiresAt <= this.clock())
          throw new ReleaseError('PREVIEW_EXPIRED');
        return searchRelease(
          tx,
          member.organisationId,
          id,
          release.snapshotHash,
          input.locale,
          input.query,
        );
      },
      false,
    );
  }
  publish(token: string, botId: string, value: unknown, key: unknown) {
    return this.create(token, botId, value, key, 'PUBLISHED');
  }
  preview(token: string, botId: string, value: unknown, key: unknown) {
    return this.create(token, botId, value, key, 'PREVIEW');
  }
  private async create(
    token: string,
    botId: string,
    value: unknown,
    key: unknown,
    kind: 'PUBLISHED' | 'PREVIEW',
  ): Promise<ReleaseDetail> {
    parse(resourceIdSchema, botId);
    const input = mutation(value);
    if (key === undefined || key === null || key === '')
      throw new ReleaseError('IDEMPOTENCY_REQUIRED');
    const parsedKey = idempotencyKeySchema.safeParse(key);
    if (!parsedKey.success) throw new ReleaseError('IDEMPOTENCY_INVALID');
    const operation = kind === 'PUBLISHED' ? 'release.publish' : 'release.preview';
    const keyHash = hash(parsedKey.data);
    const requestHash = hash(
      JSON.stringify({ operation, botId, expectedRevision: input.expectedRevision }),
    );
    const findReplay = async (
      tx: Transaction,
      organisationId: string,
      actorMembershipId: string,
    ) => {
      const record = await tx.idempotencyRecord.findFirst({
        where: { organisationId, actorMembershipId, operation, keyHash },
      });
      if (!record || record.expiresAt <= this.clock()) return null;
      if (record.requestHash !== requestHash) throw new ReleaseError('IDEMPOTENCY_CONFLICT');
      return detail(await this.load(tx, organisationId, record.releaseId));
    };
    try {
      return await this.identity.asStaff(token, 'publish', async (tx, { member }) => {
        const { organisationId } = member;
        const replay = await findReplay(tx, organisationId, member.id);
        if (replay) return replay;
        const release = await captureRelease(tx, {
          botId,
          organisationId,
          expectedRevision: input.expectedRevision,
          kind,
          providerMode: this.providerMode,
          clock: this.clock,
        });
        const createdAt = release.createdAt;
        await tx.idempotencyRecord.deleteMany({
          where: {
            organisationId,
            actorMembershipId: member.id,
            operation,
            keyHash,
            expiresAt: { lte: createdAt },
          },
        });
        await tx.idempotencyRecord.create({
          data: {
            organisationId,
            actorMembershipId: member.id,
            operation,
            keyHash,
            requestHash,
            releaseId: release.id,
            createdAt,
            expiresAt: new Date(createdAt.getTime() + RELEASE_LIMITS.idempotencyMilliseconds),
          },
        });
        await tx.auditEntry.create({
          data: {
            organisationId,
            actorMembershipId: member.id,
            action: kind === 'PUBLISHED' ? 'release.published' : 'release.previewed',
            targetId: release.id,
          },
        });
        return detail(release);
      });
    } catch (error) {
      // Two sessions can reuse one actor's key against different bots. Resolve a
      // unique-key race in a fresh transaction, with authority checked again.
      if (!(error instanceof IdentityError) || error.code !== 'CONFLICT') throw error;
      return this.identity.asStaff(token, 'publish', async (tx, { member }) => {
        const replay = await findReplay(tx, member.organisationId, member.id);
        if (!replay) throw error;
        return replay;
      });
    }
  }
}
