import type { Prisma } from '@svara/database';
import {
  botArchiveSchema,
  botCreateSchema,
  botDraftSchema,
  botListSchema,
  botSaveSchema,
  emptyBotDraft,
  resourceIdSchema,
} from '@svara/contracts';
import type { BotDraft } from '@svara/contracts';
import type { IdentityService } from '../identity/service.js';
import { IdentityError } from '../identity/errors.js';
import { AuthoringError } from './errors.js';

type StoredBot = Prisma.BotGetPayload<{ include: { draft: true } }>;
export interface BotSummary {
  id: string;
  name: string;
  description: string;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface BotDetail extends BotSummary {
  draft: BotDraft;
}

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_INPUT');
  return result.data;
}
function mutation<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  if (value && typeof value === 'object' && !('expectedRevision' in value))
    throw new AuthoringError('PRECONDITION_REQUIRED');
  return parse(schema, value);
}
function summary(bot: Omit<StoredBot, 'draft'>): BotSummary {
  return {
    id: bot.id,
    name: bot.name,
    description: bot.description,
    revision: bot.revision,
    archivedAt: bot.archivedAt?.toISOString() ?? null,
    createdAt: bot.createdAt.toISOString(),
    updatedAt: bot.updatedAt.toISOString(),
  };
}
function detail(bot: StoredBot): BotDetail {
  if (!bot.draft) throw new Error('Bot draft is missing.');
  return { ...summary(bot), draft: botDraftSchema.parse(bot.draft.config) };
}

export class BotService {
  constructor(private readonly identity: IdentityService) {}

  private async load(
    tx: Prisma.TransactionClient,
    organisationId: string,
    id: string,
  ): Promise<StoredBot> {
    const bot = await tx.bot.findFirst({ where: { id, organisationId }, include: { draft: true } });
    if (!bot) throw new IdentityError('NOT_FOUND');
    return bot;
  }

  async create(token: string, value: unknown): Promise<BotDetail> {
    const data = parse(botCreateSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const bot = await tx.bot.create({
        data: {
          ...data,
          organisationId: member.organisationId,
          draft: { create: { config: emptyBotDraft() } },
        },
        include: { draft: true },
      });
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: 'bot.created',
          targetId: bot.id,
        },
      });
      return detail(bot);
    });
  }

  async list(
    token: string,
    value: unknown,
  ): Promise<{ items: BotSummary[]; total: number; page: number; pageSize: number }> {
    const query = parse(botListSchema, value);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const where = {
          organisationId: member.organisationId,
          ...(query.includeArchived ? {} : { archivedAt: null }),
          ...(query.search
            ? { name: { contains: query.search, mode: 'insensitive' as const } }
            : {}),
        };
        const rows = await tx.bot.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.pageSize,
          skip: (query.page - 1) * query.pageSize,
        });
        const total = await tx.bot.count({ where });
        return { items: rows.map(summary), total, page: query.page, pageSize: query.pageSize };
      },
      false,
    );
  }

  async get(token: string, id: string): Promise<BotDetail> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => detail(await this.load(tx, member.organisationId, id)),
      false,
    );
  }

  async save(token: string, id: string, value: unknown): Promise<BotDetail> {
    parse(resourceIdSchema, id);
    const data = mutation(botSaveSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const bot = await this.load(tx, member.organisationId, id);
      if (bot.revision !== data.expectedRevision)
        throw new AuthoringError('REVISION_CONFLICT', bot.revision);
      if (bot.archivedAt) throw new AuthoringError('ARCHIVED', bot.revision);
      const updated = await tx.bot.updateMany({
        where: { id, organisationId: member.organisationId, revision: data.expectedRevision },
        data: { name: data.name, description: data.description, revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new AuthoringError('REVISION_CONFLICT', bot.revision);
      await tx.botDraft.update({ where: { botId: id }, data: { config: data.draft } });
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: 'bot.draft.saved',
          targetId: id,
        },
      });
      return detail(await this.load(tx, member.organisationId, id));
    });
  }

  async archive(token: string, id: string, value: unknown): Promise<BotDetail> {
    parse(resourceIdSchema, id);
    const data = mutation(botArchiveSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const bot = await this.load(tx, member.organisationId, id);
      if (bot.revision !== data.expectedRevision)
        throw new AuthoringError('REVISION_CONFLICT', bot.revision);
      await tx.bot.update({
        where: { id_organisationId: { id, organisationId: member.organisationId } },
        data: { archivedAt: data.archived ? new Date() : null, revision: { increment: 1 } },
      });
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: data.archived ? 'bot.archived' : 'bot.restored',
          targetId: id,
        },
      });
      return detail(await this.load(tx, member.organisationId, id));
    });
  }
}
