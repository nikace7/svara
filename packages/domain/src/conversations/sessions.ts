import type { Prisma } from '@svara/database';
import { resourceIdSchema, sessionListQuerySchema } from '@svara/contracts';
import type {
  AnalyticsLatency,
  AnalyticsOverview,
  Locale,
  SessionDetail,
  SessionSummary,
  ToolStatus,
} from '@svara/contracts';
import { analyticsLatency, analyticsOverview, analyticsScope } from './analytics.js';
import type { IdentityService } from '../identity/service.js';
import { blankTranscripts, endSessions, sessionView } from './core.js';
import { ConversationError } from './errors.js';

type Transaction = Prisma.TransactionClient;
const summaryInclude = {
  release: { select: { version: true, bot: { select: { name: true } } } },
  device: { select: { name: true } },
  link: { select: { label: true, slug: true } },
  _count: { select: { turns: true } },
} as const;
type StoredSummary = Prisma.ConversationSessionGetPayload<{ include: typeof summaryInclude }>;

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ConversationError('INVALID_INPUT');
  return result.data;
}
function summary(session: StoredSummary): SessionSummary {
  return {
    ...sessionView(session),
    botName: session.release.bot.name,
    releaseVersion: session.release.version,
    deviceName: session.device?.name ?? null,
    linkLabel: session.link ? session.link.label || session.link.slug : null,
    turns: session._count.turns,
    transcriptDeleted: session.transcriptDeletedAt !== null,
  };
}

/** Staff history: what was heard, answered, cited and done, scoped to one organisation. */
export class ConversationSessions {
  constructor(
    private readonly identity: IdentityService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(
    token: string,
    value: unknown,
  ): Promise<{ items: SessionSummary[]; nextCursor: string | null }> {
    const query = parse(sessionListQuerySchema, value);
    const limit = query.limit ?? 25;
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const rows = await tx.conversationSession.findMany({
          where: {
            organisationId: member.organisationId,
            ...(query.actorKind ? { actorKind: query.actorKind } : {}),
            ...(query.status ? { status: query.status } : {}),
          },
          include: summaryInclude,
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        });
        const items = rows.slice(0, limit).map(summary);
        return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
      },
      false,
    );
  }

  async get(token: string, id: string): Promise<SessionDetail> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(
      token,
      'inspect',
      (tx, { member }) => this.detail(tx, member.organisationId, id),
      false,
    );
  }

  private async detail(tx: Transaction, organisationId: string, id: string) {
    const session = await tx.conversationSession.findFirst({
      where: { id, organisationId },
      include: {
        ...summaryInclude,
        turns: {
          orderBy: { ordinal: 'asc' },
          include: { tools: { orderBy: { createdAt: 'asc' }, include: { command: true } } },
        },
      },
    });
    if (!session) throw new ConversationError('NOT_FOUND');
    return {
      ...summary(session),
      turnList: session.turns.map((turn) => ({
        id: turn.id,
        ordinal: turn.ordinal,
        locale: turn.locale as Locale,
        inputKind: turn.inputKind,
        question: turn.transcript,
        answer: turn.answer,
        state: turn.state,
        failureCode: turn.failureCode,
        citedEntryIds: turn.citedEntryIds,
        retryOfId: turn.retryOfId,
        timings: {
          sttMs: turn.sttMs,
          firstTextMs: turn.firstTextMs,
          firstAudioMs: turn.firstAudioMs,
          totalMs: turn.totalMs,
        },
        createdAt: turn.createdAt.toISOString(),
        tools: turn.tools.map((tool) => ({
          id: tool.id,
          name: tool.name,
          status: tool.status as ToolStatus,
          reason: tool.reason,
          arguments: tool.arguments,
          result: tool.result,
          commandId: tool.commandId,
          // A late acknowledgement shows here even after the answer moved on.
          commandStatus: tool.command
            ? tool.command.result
              ? `${tool.command.status}:${tool.command.result}`
              : tool.command.status
            : null,
          createdAt: tool.createdAt.toISOString(),
        })),
      })),
    };
  }

  /** Recorded counts for one provider mode, optional locale and window. */
  async overview(token: string, value: unknown): Promise<AnalyticsOverview> {
    return this.identity.asStaff(
      token,
      'inspect',
      (tx, { member }) =>
        analyticsOverview(tx, analyticsScope(value, member.organisationId, this.clock())),
      false,
    );
  }

  /** Measured timing distributions; insufficient samples report no percentiles. */
  async latency(token: string, value: unknown): Promise<AnalyticsLatency> {
    return this.identity.asStaff(
      token,
      'inspect',
      (tx, { member }) =>
        analyticsLatency(tx, analyticsScope(value, member.organisationId, this.clock())),
      false,
    );
  }

  /** Ends the session and removes its transcript and tool payloads (see `blankTranscripts`). */
  async deleteTranscript(token: string, id: string): Promise<SessionDetail> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(token, 'delete_transcripts', async (tx, { member }) => {
      const session = await tx.conversationSession.findFirst({
        where: { id, organisationId: member.organisationId },
        select: { id: true },
      });
      if (!session) throw new ConversationError('NOT_FOUND');
      const now = this.clock();
      await endSessions(tx, { id }, 'TRANSCRIPT_DELETED', now);
      await blankTranscripts(tx, [id], now);
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: 'conversation.transcript.deleted',
          targetId: id,
        },
      });
      return this.detail(tx, member.organisationId, id);
    });
  }
}
