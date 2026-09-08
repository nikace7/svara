import type { Prisma } from '@svara/database';
import {
  knowledgeApprovalErrors,
  knowledgeApprovalSchema,
  knowledgeCreateSchema,
  knowledgeDeleteSchema,
  knowledgeListSchema,
  knowledgeSaveSchema,
  knowledgeSelectionSchema,
  resourceIdSchema,
} from '@svara/contracts';
import type { KnowledgeDetail, KnowledgePage, KnowledgeSummary } from '@svara/contracts';
import type { IdentityService } from '../identity/service.js';
import { IdentityError } from '../identity/errors.js';
import { AuthoringError } from './errors.js';

type Entry = Prisma.KnowledgeEntryGetPayload<{ include: { bot: true } }>;
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
function parse<T>(schema: Schema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new IdentityError('INVALID_INPUT');
  return parsed.data;
}
function mutation<T>(schema: Schema<T>, value: unknown): T {
  if (value && typeof value === 'object' && !('expectedRevision' in value))
    throw new AuthoringError('PRECONDITION_REQUIRED');
  return parse(schema, value);
}
function text(entry: Omit<Entry, 'bot'>) {
  return {
    type: entry.type,
    title: entry.title,
    content: { en: entry.contentEn, ne: entry.contentNe },
    question: { en: entry.questionEn, ne: entry.questionNe },
  };
}
function summary(entry: Omit<Entry, 'bot'>): KnowledgeSummary {
  const errors = knowledgeApprovalErrors(text(entry));
  return {
    id: entry.id,
    botId: entry.botId,
    type: entry.type,
    title: entry.title,
    status: entry.status,
    selected: entry.selected,
    revision: entry.revision,
    complete: {
      en: !errors['content.en'] && !errors['question.en'],
      ne: !errors['content.ne'] && !errors['question.ne'],
    },
    approvedAt: entry.approvedAt?.toISOString() ?? null,
    updatedAt: entry.updatedAt.toISOString(),
  };
}
function detail(entry: Entry): KnowledgeDetail {
  return {
    ...summary(entry),
    ...text(entry),
    botRevision: entry.bot.revision,
    botArchivedAt: entry.bot.archivedAt?.toISOString() ?? null,
  };
}

export class KnowledgeService {
  constructor(private readonly identity: IdentityService) {}
  private async bot(tx: Prisma.TransactionClient, organisationId: string, id: string) {
    const bot = await tx.bot.findFirst({ where: { id, organisationId } });
    if (!bot) throw new IdentityError('NOT_FOUND');
    return bot;
  }
  private async entry(
    tx: Prisma.TransactionClient,
    organisationId: string,
    id: string,
  ): Promise<Entry> {
    const entry = await tx.knowledgeEntry.findFirst({
      where: { id, organisationId },
      include: { bot: true },
    });
    if (!entry) throw new IdentityError('NOT_FOUND');
    return entry;
  }
  private check(entry: Entry, expectedRevision: number) {
    if (entry.revision !== expectedRevision)
      throw new AuthoringError('REVISION_CONFLICT', entry.revision);
    if (entry.bot.archivedAt) throw new AuthoringError('ARCHIVED', entry.revision);
  }
  private async audit(
    tx: Prisma.TransactionClient,
    organisationId: string,
    actorMembershipId: string,
    action: string,
    targetId: string,
  ) {
    await tx.auditEntry.create({ data: { organisationId, actorMembershipId, action, targetId } });
  }
  private async change(
    token: string,
    id: string,
    expectedRevision: number,
    permission: 'author' | 'publish',
    action: string,
    patch: (entry: Entry, memberId: string) => Prisma.KnowledgeEntryUncheckedUpdateInput,
  ): Promise<KnowledgeDetail> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(token, permission, async (tx, { member }) => {
      const entry = await this.entry(tx, member.organisationId, id);
      this.check(entry, expectedRevision);
      const data = patch(entry, member.id);
      await tx.bot.update({
        where: { id_organisationId: { id: entry.botId, organisationId: member.organisationId } },
        data: { revision: { increment: 1 } },
      });
      const updated = await tx.knowledgeEntry.update({
        where: { id_organisationId: { id, organisationId: member.organisationId } },
        data: { ...data, revision: { increment: 1 } },
        include: { bot: true },
      });
      await this.audit(tx, member.organisationId, member.id, action, id);
      return detail(updated);
    });
  }
  async create(token: string, botId: string, value: unknown): Promise<KnowledgeDetail> {
    parse(resourceIdSchema, botId);
    const data = parse(knowledgeCreateSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const bot = await this.bot(tx, member.organisationId, botId);
      if (bot.archivedAt) throw new AuthoringError('ARCHIVED', bot.revision);
      await tx.bot.update({
        where: { id_organisationId: { id: botId, organisationId: member.organisationId } },
        data: { revision: { increment: 1 } },
      });
      const entry = await tx.knowledgeEntry.create({
        data: { ...data, botId, organisationId: member.organisationId },
        include: { bot: true },
      });
      await this.audit(tx, member.organisationId, member.id, 'knowledge.created', entry.id);
      return detail(entry);
    });
  }
  async list(token: string, botId: string, value: unknown): Promise<KnowledgePage> {
    parse(resourceIdSchema, botId);
    const query = parse(knowledgeListSchema, value);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        await this.bot(tx, member.organisationId, botId);
        const where = {
          botId,
          organisationId: member.organisationId,
          ...(query.status === 'ALL' ? {} : { status: query.status }),
          ...(query.type === 'ALL' ? {} : { type: query.type }),
          ...(query.search
            ? { title: { contains: query.search, mode: 'insensitive' as const } }
            : {}),
        };
        const items = await tx.knowledgeEntry.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.pageSize,
          skip: (query.page - 1) * query.pageSize,
        });
        const total = await tx.knowledgeEntry.count({ where });
        return { items: items.map(summary), total, page: query.page, pageSize: query.pageSize };
      },
      false,
    );
  }
  async get(token: string, id: string): Promise<KnowledgeDetail> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => detail(await this.entry(tx, member.organisationId, id)),
      false,
    );
  }
  async save(token: string, id: string, value: unknown): Promise<KnowledgeDetail> {
    const data = mutation(knowledgeSaveSchema, value);
    return this.change(token, id, data.expectedRevision, 'author', 'knowledge.saved', () => ({
      type: data.type,
      title: data.title,
      contentEn: data.content.en,
      contentNe: data.content.ne,
      questionEn: data.type === 'FAQ' ? data.question.en : '',
      questionNe: data.type === 'FAQ' ? data.question.ne : '',
      status: 'DRAFT',
      approvedAt: null,
      approvedByMembershipId: null,
    }));
  }
  async approve(token: string, id: string, value: unknown): Promise<KnowledgeDetail> {
    const data = mutation(knowledgeApprovalSchema, value);
    return this.change(
      token,
      id,
      data.expectedRevision,
      'publish',
      data.approved ? 'knowledge.approved' : 'knowledge.unapproved',
      (entry, memberId) => {
        const fields = data.approved ? knowledgeApprovalErrors(text(entry)) : {};
        if (Object.keys(fields).length)
          throw new AuthoringError('INCOMPLETE_TRANSLATIONS', entry.revision, fields);
        return {
          status: data.approved ? 'APPROVED' : 'DRAFT',
          approvedAt: data.approved ? new Date() : null,
          approvedByMembershipId: data.approved ? memberId : null,
        };
      },
    );
  }
  async select(token: string, id: string, value: unknown): Promise<KnowledgeDetail> {
    const data = mutation(knowledgeSelectionSchema, value);
    return this.change(
      token,
      id,
      data.expectedRevision,
      'author',
      'knowledge.selection.updated',
      () => ({ selected: data.selected }),
    );
  }
  async remove(
    token: string,
    id: string,
    value: unknown,
  ): Promise<{ ok: true; botRevision: number }> {
    parse(resourceIdSchema, id);
    const data = mutation(knowledgeDeleteSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const entry = await this.entry(tx, member.organisationId, id);
      this.check(entry, data.expectedRevision);
      await tx.knowledgeEntry.delete({
        where: { id_organisationId: { id, organisationId: member.organisationId } },
      });
      const bot = await tx.bot.update({
        where: { id_organisationId: { id: entry.botId, organisationId: member.organisationId } },
        data: { revision: { increment: 1 } },
      });
      await this.audit(tx, member.organisationId, member.id, 'knowledge.deleted', id);
      return { ok: true, botRevision: bot.revision };
    });
  }
}
