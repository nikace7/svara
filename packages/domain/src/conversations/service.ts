import type { PrismaClient, Prisma } from '@svara/database';
import {
  CONVERSATION_LIMITS,
  botToolSchema,
  conversationAdmitSchema,
  conversationInterruptSchema,
  conversationTurnSchema,
  releaseSnapshotSchema,
  resourceIdSchema,
} from '@svara/contracts';
import type {
  BotDraft,
  ConversationAdmission,
  ConversationSession,
  Locale,
  ProviderMode,
  ReleaseSearchResult,
  ReleaseSnapshot,
  ToolStatus,
} from '@svara/contracts';
import { searchRelease } from '../authoring/release-search.js';
import { bearerPattern, hashSecret } from '../devices/core.js';
import type { DeviceRuntime } from '../devices/runtime.js';
import type { IdentityService } from '../identity/service.js';
import { endSessions, sessionView, toolsFor, usageDay } from './core.js';
import { runTool, toolOutcome } from './tools.js';
import type { ToolEffect } from './tools.js';
import { ConversationError } from './errors.js';
import type { ConversationErrorCode } from './errors.js';

type Transaction = Prisma.TransactionClient;
type StoredSession = Prisma.ConversationSessionGetPayload<object>;
export type BotTool = BotDraft['tools'][number];

/** Who is speaking. Each kind proves itself with its own HttpOnly cookie. */
export type ConversationActor =
  | { kind: 'STAFF'; token: string }
  | { kind: 'DEVICE'; token: string }
  | { kind: 'VISITOR'; slug: string; token: string };
interface Scope {
  organisationId: string;
  actorKind: 'STAFF' | 'DEVICE' | 'VISITOR';
  membershipId: string | null;
  deviceId: string | null;
  linkId: string | null;
  grantId: string | null;
}
type Result<T> = { ok: T } | { fail: ConversationErrorCode };
const fail = (code: ConversationErrorCode): { fail: ConversationErrorCode } => ({ fail: code });

/** Everything a turn needs, resolved once under the actor's authority. */
export interface TurnContext {
  sessionId: string;
  turnId: string;
  organisationId: string;
  deviceId: string | null;
  generation: number;
  locale: Locale;
  providerMode: ProviderMode;
  releaseId: string;
  snapshotHash: string;
  snapshot: ReleaseSnapshot;
  tools: BotTool[];
  question: string;
  audio: Uint8Array | null;
  history: { role: 'user' | 'assistant'; text: string }[];
  /** Side effects a retried turn already made; they are reported, never repeated. */
  priorTools: { name: string; status: ToolStatus; result: unknown }[];
}
export interface ToolCallInput {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}
export interface ToolOutcome {
  id: string;
  name: string;
  status: ToolStatus;
  reason: string | null;
  result: unknown;
  duplicate: boolean;
  command: { id: string; stateRevision: number } | null;
}
export interface TurnFinish {
  state: 'COMPLETED' | 'INTERRUPTED' | 'FAILED';
  answer: string;
  citedEntryIds: string[];
  failureCode: string | null;
  timings: { sttMs?: number; firstTextMs?: number; firstAudioMs?: number; totalMs?: number };
}

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ConversationError('INVALID_INPUT');
  return result.data;
}
/** The actor's own columns: a filter for its sessions and the values for a new one. */
const actorWhere = (scope: Scope) => ({
  organisationId: scope.organisationId,
  actorKind: scope.actorKind,
  membershipId: scope.membershipId,
  deviceId: scope.deviceId,
  linkId: scope.linkId,
  grantId: scope.grantId,
});
const later = (now: Date, seconds: number) => new Date(now.getTime() + seconds * 1000);
/** Staff and system reasons end a conversation for good; only an interrupted one resumes. */
const resumable = new Set(['REPLACED', 'ENDED', 'IDLE']);

export interface ConversationOptions {
  /** The mode conversations actually run in; recorded on every session. */
  providerMode: ProviderMode;
  pepper: string;
  clock?: () => Date;
}

/**
 * Conversation admission and durable turn records for staff playground, paired kiosk and
 * public visitor actors. The server derives organisation, release and device from the actor's
 * credential; nothing a client or model sends can widen that scope.
 */
export class ConversationService {
  private readonly clock: () => Date;
  constructor(
    private readonly db: PrismaClient,
    private readonly identity: IdentityService,
    private readonly runtime: DeviceRuntime,
    private readonly options: ConversationOptions,
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  private transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });
  }

  /** Resolves the actor and runs `run` in one transaction; a failure commits before it throws. */
  private async within<T>(
    actor: ConversationActor,
    run: (tx: Transaction, scope: Scope) => Promise<Result<T>>,
  ): Promise<T> {
    let outcome: Result<T>;
    if (actor.kind === 'STAFF')
      outcome = await this.identity.asStaff(actor.token, 'operate_devices', (tx, { member }) =>
        run(tx, {
          organisationId: member.organisationId,
          actorKind: 'STAFF',
          membershipId: member.id,
          deviceId: null,
          linkId: null,
          grantId: null,
        }),
      );
    else if (actor.kind === 'DEVICE')
      outcome = await this.runtime.asCredential(actor.token, (tx, device) =>
        run(tx, {
          organisationId: device.organisationId,
          actorKind: 'DEVICE',
          membershipId: null,
          deviceId: device.deviceId,
          linkId: null,
          grantId: null,
        }),
      );
    else
      outcome = await this.transaction(async (tx) => {
        const scope = await this.visitor(tx, actor.slug, actor.token);
        return 'fail' in scope ? scope : run(tx, scope.ok);
      });
    if ('fail' in outcome) throw new ConversationError(outcome.fail);
    return outcome.ok;
  }

  /** A visitor grant is valid only for its own enabled, unexpired link. */
  private async visitor(tx: Transaction, slug: string, token: string): Promise<Result<Scope>> {
    if (!bearerPattern.test(token)) return fail('VISITOR_UNAUTHENTICATED');
    const tokenHash = hashSecret('visitor-grant', token, this.options.pepper);
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "VisitorGrant" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
    const grant = row
      ? await tx.visitorGrant.findUnique({ where: { id: row.id }, include: { link: true } })
      : null;
    const now = this.clock();
    if (!grant || grant.expiresAt <= now || grant.link.slug !== slug)
      return fail('VISITOR_UNAUTHENTICATED');
    if (!grant.link.enabled || (grant.link.expiresAt && grant.link.expiresAt <= now))
      return fail('LINK_UNAVAILABLE');
    return {
      ok: {
        organisationId: grant.organisationId,
        actorKind: 'VISITOR',
        membershipId: null,
        deviceId: null,
        linkId: grant.linkId,
        grantId: grant.id,
      },
    };
  }

  /** The release a new session pins: chosen by staff, deployed on a kiosk, or the link's. */
  private async pinRelease(
    tx: Transaction,
    scope: Scope,
    releaseId: string | undefined,
    now: Date,
  ): Promise<Result<string>> {
    if (scope.actorKind === 'STAFF') {
      if (!releaseId) return fail('INVALID_INPUT');
      const release = await tx.botRelease.findFirst({
        where: { id: releaseId, organisationId: scope.organisationId },
        select: { kind: true, previewExpiresAt: true },
      });
      if (!release) return fail('NOT_FOUND');
      if (release.previewExpiresAt && release.previewExpiresAt <= now)
        return fail('RELEASE_UNAVAILABLE');
      return { ok: releaseId };
    }
    if (releaseId) return fail('INVALID_INPUT');
    if (scope.actorKind === 'VISITOR') {
      const link = await tx.assistantLink.findUniqueOrThrow({ where: { id: scope.linkId! } });
      return { ok: link.releaseId };
    }
    // A kiosk may talk only once its current desired release is fully applied.
    const device = await tx.device.findUniqueOrThrow({ where: { id: scope.deviceId! } });
    const state = await tx.desiredDeviceState.findUnique({ where: { deviceId: scope.deviceId! } });
    if (
      device.maintenanceMode ||
      !state?.releaseId ||
      state.appliedReleaseId !== state.releaseId ||
      state.appliedRevision !== state.revision
    )
      return fail('NOT_READY');
    return { ok: state.releaseId };
  }

  async admit(actor: ConversationActor, value: unknown): Promise<ConversationAdmission> {
    const input = parse(conversationAdmitSchema, value);
    return this.within(actor, async (tx, scope) => {
      const now = this.clock();
      const pinned = await this.pinRelease(tx, scope, input.releaseId, now);
      if ('fail' in pinned) return pinned;
      const releaseId = pinned.ok;
      let history: ConversationAdmission['history'] = [];
      if (input.resumeFrom) {
        const previous = await tx.conversationSession.findFirst({
          where: { ...actorWhere(scope), id: input.resumeFrom, releaseId },
        });
        const recent =
          previous &&
          (previous.status === 'ACTIVE' ||
            (previous.endedAt &&
              resumable.has(previous.endReason ?? '') &&
              previous.endedAt.getTime() >
                now.getTime() - CONVERSATION_LIMITS.resumeMinutes * 60000));
        if (!recent || previous.transcriptDeletedAt) return fail('RESUME_UNAVAILABLE');
        const turns = await tx.conversationTurn.findMany({
          where: { sessionId: previous.id, state: { in: ['COMPLETED', 'INTERRUPTED'] } },
          orderBy: { ordinal: 'desc' },
          take: CONVERSATION_LIMITS.historyTurns,
        });
        history = turns.reverse().map((turn) => ({
          locale: turn.locale as Locale,
          question: turn.transcript,
          answer: turn.answer,
          state: turn.state,
        }));
      }
      // One open session per actor: a new admission closes the previous one first.
      await endSessions(tx, actorWhere(scope), 'REPLACED', now);
      if (scope.grantId) {
        const grant = await tx.visitorGrant.findUniqueOrThrow({ where: { id: scope.grantId } });
        if (grant.sessionCount >= CONVERSATION_LIMITS.grantSessions) return fail('GRANT_LIMIT');
        await tx.visitorGrant.update({
          where: { id: grant.id },
          data: { sessionCount: { increment: 1 } },
        });
      }
      // Every admission for this organisation serializes on its usage row for today.
      const day = usageDay(now);
      await tx.$executeRaw`INSERT INTO "DailyUsage" ("organisationId", "usageDate")
        VALUES (${scope.organisationId}::uuid, ${day}::date) ON CONFLICT DO NOTHING`;
      const [usage] = await tx.$queryRaw<{ liveSessions: number; reservedSeconds: number }[]>`
        SELECT "liveSessions", "reservedSeconds" FROM "DailyUsage"
          WHERE "organisationId" = ${scope.organisationId}::uuid AND "usageDate" = ${day}::date FOR UPDATE`;
      const active = await tx.conversationSession.count({
        where: {
          organisationId: scope.organisationId,
          status: 'ACTIVE',
          idleUntil: { gt: now },
          endsBy: { gt: now },
        },
      });
      if (active >= CONVERSATION_LIMITS.organisationConcurrent) return fail('CONCURRENCY_LIMIT');
      const live = this.options.providerMode === 'live';
      const reserved = live ? CONVERSATION_LIMITS.sessionSeconds : 0;
      if (
        live &&
        (usage!.liveSessions >= CONVERSATION_LIMITS.dailyLiveSessions ||
          usage!.reservedSeconds + reserved > CONVERSATION_LIMITS.dailyLiveSeconds)
      )
        return fail('DAILY_LIMIT');
      if (live)
        await tx.dailyUsage.update({
          where: {
            organisationId_usageDate: { organisationId: scope.organisationId, usageDate: day },
          },
          data: { liveSessions: { increment: 1 }, reservedSeconds: { increment: reserved } },
        });
      const session = await tx.conversationSession.create({
        data: {
          ...actorWhere(scope),
          releaseId,
          resumedFromId: input.resumeFrom ?? null,
          locale: input.locale,
          providerMode: this.options.providerMode,
          startedAt: now,
          idleUntil: later(now, CONVERSATION_LIMITS.idleSeconds),
          endsBy: later(now, CONVERSATION_LIMITS.sessionSeconds),
          reservedSeconds: reserved,
        },
      });
      const snapshot = await this.snapshot(tx, releaseId, scope.organisationId);
      return {
        ok: {
          session: sessionView(session),
          history,
          tools: toolsFor(snapshot.snapshot, scope.actorKind),
        },
      };
    });
  }

  private async snapshot(tx: Transaction, releaseId: string, organisationId: string) {
    const release = await tx.botRelease.findFirstOrThrow({
      where: { id: releaseId, organisationId },
      select: { snapshot: true, snapshotHash: true },
    });
    return {
      snapshot: releaseSnapshotSchema.parse(release.snapshot),
      snapshotHash: release.snapshotHash,
    };
  }

  /**
   * The actor's own session, still open. Expiry, a changed kiosk release or a withdrawn link
   * ends it here, so the backend enforces the stop even when a client missed the event.
   */
  private async open(
    tx: Transaction,
    scope: Scope,
    sessionId: string,
    now: Date,
  ): Promise<Result<StoredSession>> {
    await tx.$queryRaw`SELECT "id" FROM "ConversationSession" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
    const session = await tx.conversationSession.findFirst({
      where: { ...actorWhere(scope), id: sessionId },
    });
    if (!session) return fail('NOT_FOUND');
    if (session.status !== 'ACTIVE') return fail('SESSION_ENDED');
    let reason: 'EXPIRED' | 'IDLE' | 'RELEASE_CHANGED' | undefined;
    if (session.endsBy <= now) reason = 'EXPIRED';
    else if (session.idleUntil <= now) reason = 'IDLE';
    else if (scope.deviceId) {
      const state = await tx.desiredDeviceState.findUnique({ where: { deviceId: scope.deviceId } });
      if (state?.releaseId !== session.releaseId || state.appliedReleaseId !== session.releaseId)
        reason = 'RELEASE_CHANGED';
    }
    if (reason) {
      await endSessions(
        tx,
        { id: session.id },
        reason,
        now,
        reason === 'RELEASE_CHANGED' ? 'elapsed' : 'reserved',
      );
      return fail('SESSION_ENDED');
    }
    return { ok: session };
  }

  async beginTurn(
    actor: ConversationActor,
    sessionId: string,
    value: unknown,
  ): Promise<TurnContext> {
    parse(resourceIdSchema, sessionId);
    const input = parse(conversationTurnSchema, value);
    return this.within(actor, async (tx, scope) => {
      const now = this.clock();
      const open = await this.open(tx, scope, sessionId, now);
      if ('fail' in open) return open;
      const session = open.ok;
      if (input.generation <= session.generation) return fail('STALE_GENERATION');
      const duplicate = await tx.conversationTurn.findFirst({
        where: { sessionId, clientMessageId: input.clientMessageId },
        select: { id: true },
      });
      if (duplicate) return fail('DUPLICATE_MESSAGE');
      let question = input.text ?? '';
      let priorTools: TurnContext['priorTools'] = [];
      if (input.retryOf) {
        const original = await tx.conversationTurn.findFirst({
          where: { id: input.retryOf, sessionId, state: { in: ['FAILED', 'INTERRUPTED'] } },
          include: { tools: true },
        });
        if (!original?.transcript) return fail('RETRY_UNAVAILABLE');
        question = original.transcript;
        priorTools = original.tools
          .filter((tool) => tool.status !== 'REJECTED')
          .map((tool) => ({
            name: tool.name,
            status: tool.status as ToolStatus,
            result: tool.result,
          }));
      }
      if (scope.grantId) {
        const grant = await tx.visitorGrant.findUniqueOrThrow({ where: { id: scope.grantId } });
        if (grant.turnCount >= CONVERSATION_LIMITS.grantTurns) return fail('GRANT_LIMIT');
        await tx.visitorGrant.update({
          where: { id: grant.id },
          data: { turnCount: { increment: 1 } },
        });
      }
      // A newer turn supersedes whatever the previous generation was still saying.
      await tx.conversationTurn.updateMany({
        where: { sessionId, state: 'ANSWERING' },
        data: { state: 'INTERRUPTED', completedAt: now },
      });
      // While an answer is in flight only the absolute limit applies; finishing restarts idle.
      await tx.conversationSession.update({
        where: { id: sessionId },
        data: { generation: input.generation, idleUntil: session.endsBy, locale: input.locale },
      });
      const last = await tx.conversationTurn.findFirst({
        where: { sessionId },
        orderBy: { ordinal: 'desc' },
        select: { ordinal: true },
      });
      const turn = await tx.conversationTurn.create({
        data: {
          organisationId: scope.organisationId,
          sessionId,
          ordinal: (last?.ordinal ?? 0) + 1,
          generation: input.generation,
          clientMessageId: input.clientMessageId,
          retryOfId: input.retryOf ?? null,
          inputKind: input.audio ? 'VOICE' : 'TEXT',
          locale: input.locale,
          transcript: question,
          createdAt: now,
        },
      });
      const history = await tx.conversationTurn.findMany({
        where: {
          sessionId: { in: [sessionId, session.resumedFromId].filter((id): id is string => !!id) },
          state: 'COMPLETED',
          id: { not: turn.id },
        },
        orderBy: { createdAt: 'desc' },
        take: CONVERSATION_LIMITS.historyTurns,
      });
      const { snapshot, snapshotHash } = await this.snapshot(
        tx,
        session.releaseId,
        scope.organisationId,
      );
      return {
        ok: {
          sessionId,
          turnId: turn.id,
          organisationId: scope.organisationId,
          deviceId: scope.deviceId,
          generation: input.generation,
          locale: input.locale,
          providerMode: session.providerMode as ProviderMode,
          releaseId: session.releaseId,
          snapshotHash,
          snapshot,
          tools: toolsFor(snapshot, scope.actorKind),
          question,
          audio: input.audio ? Buffer.from(input.audio, 'base64') : null,
          history: history.reverse().flatMap((item) => [
            { role: 'user' as const, text: item.transcript },
            { role: 'assistant' as const, text: item.answer },
          ]),
          priorTools,
        },
      };
    });
  }

  async interrupt(
    actor: ConversationActor,
    sessionId: string,
    value: unknown,
  ): Promise<ConversationSession> {
    parse(resourceIdSchema, sessionId);
    const { generation } = parse(conversationInterruptSchema, value);
    return this.within(actor, async (tx, scope) => {
      const now = this.clock();
      const open = await this.open(tx, scope, sessionId, now);
      if ('fail' in open) return open;
      if (generation <= open.ok.generation) return { ok: sessionView(open.ok) };
      await tx.conversationTurn.updateMany({
        where: { sessionId, state: 'ANSWERING' },
        data: { state: 'INTERRUPTED', completedAt: now },
      });
      const session = await tx.conversationSession.update({
        where: { id: sessionId },
        data: { generation, idleUntil: later(now, CONVERSATION_LIMITS.idleSeconds) },
      });
      return { ok: sessionView(session) };
    });
  }

  async end(actor: ConversationActor, sessionId: string): Promise<ConversationSession> {
    parse(resourceIdSchema, sessionId);
    return this.within(actor, async (tx, scope) => {
      const session = await tx.conversationSession.findFirst({
        where: { ...actorWhere(scope), id: sessionId },
      });
      if (!session) return fail('NOT_FOUND');
      await endSessions(tx, { id: sessionId }, 'ENDED', this.clock());
      return {
        ok: sessionView(
          await tx.conversationSession.findUniqueOrThrow({ where: { id: sessionId } }),
        ),
      };
    });
  }

  /** Server-held identifiers only: the turn's session and release were fixed at beginTurn. */
  async search(turn: TurnContext, locale: Locale, query: string): Promise<ReleaseSearchResult> {
    return this.transaction((tx) =>
      searchRelease(
        tx,
        turn.organisationId,
        turn.releaseId,
        turn.snapshotHash,
        locale === 'ne-NP' ? 'ne' : 'en',
        query.slice(0, 500),
      ),
    );
  }

  async setTranscript(turn: TurnContext, transcript: string): Promise<void> {
    await this.db.conversationTurn.updateMany({
      where: { id: turn.turnId, sessionId: turn.sessionId, state: 'ANSWERING' },
      data: { transcript: transcript.slice(0, 2000) },
    });
  }

  async finishTurn(turn: TurnContext, finish: TurnFinish): Promise<void> {
    const now = this.clock();
    const timing = (value: number | undefined) =>
      value === undefined ? null : Math.max(0, Math.round(value));
    await this.transaction(async (tx) => {
      // A superseded turn keeps INTERRUPTED; it still records what was generated before the stop.
      await tx.conversationTurn.updateMany({
        where: { id: turn.turnId, sessionId: turn.sessionId },
        data: {
          answer: finish.answer.slice(0, 8000),
          citedEntryIds: finish.citedEntryIds,
          sttMs: timing(finish.timings.sttMs),
          firstTextMs: timing(finish.timings.firstTextMs),
          firstAudioMs: timing(finish.timings.firstAudioMs),
          totalMs: timing(finish.timings.totalMs),
        },
      });
      await tx.conversationTurn.updateMany({
        where: { id: turn.turnId, sessionId: turn.sessionId, state: 'ANSWERING' },
        data: { state: finish.state, completedAt: now, failureCode: finish.failureCode },
      });
      await tx.conversationSession.updateMany({
        where: { id: turn.sessionId, status: 'ACTIVE', generation: turn.generation },
        data: { idleUntil: later(now, CONVERSATION_LIMITS.idleSeconds) },
      });
    });
  }

  /**
   * Validates and records one model-proposed tool call. The call must belong to the current
   * generation of a still-open session, name an allowed tool and reference only this release;
   * anything else is recorded as REJECTED with no effect. A repeated call ID returns the
   * original outcome.
   */
  async tool(
    actor: ConversationActor,
    turn: TurnContext,
    call: ToolCallInput,
  ): Promise<ToolOutcome> {
    return this.within(actor, async (tx, scope) => {
      const now = this.clock();
      const callId = call.callId.slice(0, 64);
      const existing = await tx.toolExecution.findUnique({
        where: { turnId_callId: { turnId: turn.turnId, callId } },
        include: { command: true },
      });
      if (existing) return { ok: toolOutcome(existing, true) };
      const record = async (effect: ToolEffect): Promise<Result<ToolOutcome>> => {
        // Unknown names are refused without a row; known tools are recorded even when refused.
        const known = botToolSchema.safeParse(call.name);
        if (!known.success)
          return { ok: { id: '', name: call.name, ...effect, duplicate: false, command: null } };
        const saved = await tx.toolExecution.create({
          data: {
            organisationId: turn.organisationId,
            sessionId: turn.sessionId,
            turnId: turn.turnId,
            callId,
            name: known.data,
            arguments: call.args as Prisma.InputJsonValue,
            status: effect.status,
            reason: effect.reason,
            ...(effect.result === null ? {} : { result: effect.result as Prisma.InputJsonValue }),
            commandId: effect.commandId ?? null,
            createdAt: now,
          },
          include: { command: true },
        });
        return { ok: toolOutcome(saved, false) };
      };
      const refuse = (reason: string) => record({ status: 'REJECTED', reason, result: null });
      if (!(turn.tools as string[]).includes(call.name)) return refuse('TOOL_NOT_ALLOWED');
      const open = await this.open(tx, scope, turn.sessionId, now);
      if ('fail' in open) return refuse('SESSION_ENDED');
      const current = await tx.conversationTurn.findFirst({
        where: { id: turn.turnId, sessionId: turn.sessionId, state: 'ANSWERING' },
        select: { generation: true },
      });
      if (
        !current ||
        open.ok.generation !== turn.generation ||
        current.generation !== turn.generation
      )
        return refuse('STALE_GENERATION');
      const made = await tx.toolExecution.count({ where: { turnId: turn.turnId } });
      if (made >= CONVERSATION_LIMITS.toolCalls) return refuse('TOOL_LIMIT');
      return record(await runTool(tx, turn, call, now));
    });
  }

  /** Settles a slide call from its command: APPLIED only on the kiosk's acknowledgement. */
  async slideOutcome(toolId: string): Promise<ToolOutcome['status']> {
    return this.transaction(async (tx) => {
      const tool = await tx.toolExecution.findUnique({
        where: { id: toolId },
        include: { command: true },
      });
      if (!tool?.command) return 'REJECTED';
      const { status, result, reason } = tool.command;
      const settled: ToolStatus =
        status === 'ACKNOWLEDGED' && result === 'APPLIED'
          ? 'APPLIED'
          : status === 'FAILED' || result === 'REJECTED'
            ? 'REJECTED'
            : 'PENDING';
      if (settled !== tool.status)
        await tx.toolExecution.update({
          where: { id: toolId },
          data: { status: settled, reason: settled === 'REJECTED' ? (reason ?? 'REJECTED') : null },
        });
      return settled;
    });
  }

  /** Worker sweep: stale sessions end and keep their whole reservation. */
  async expireStale(): Promise<number> {
    const now = this.clock();
    const ended = await this.transaction((tx) =>
      endSessions(
        tx,
        { OR: [{ endsBy: { lte: now } }, { idleUntil: { lte: now } }] },
        'EXPIRED',
        now,
        'reserved',
      ),
    );
    return ended.length;
  }
}
