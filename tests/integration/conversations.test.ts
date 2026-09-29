import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { BotService } from '../../packages/domain/src/authoring/bots.js';
import { KnowledgeService } from '../../packages/domain/src/authoring/knowledge.js';
import { PresentationService } from '../../packages/domain/src/authoring/presentations.js';
import { ReleaseService } from '../../packages/domain/src/authoring/releases.js';
import { DeviceService } from '../../packages/domain/src/devices/service.js';
import { DeviceRuntime } from '../../packages/domain/src/devices/runtime.js';
import { ScheduleService } from '../../packages/domain/src/schedules/service.js';
import { DeviceCommands } from '../../packages/domain/src/schedules/outbox.js';
import { ConversationService } from '../../packages/domain/src/conversations/service.js';
import type { ConversationActor } from '../../packages/domain/src/conversations/service.js';
import {
  AssistantLinkService,
  PublicAssistants,
} from '../../packages/domain/src/conversations/links.js';
import { ConversationSessions } from '../../packages/domain/src/conversations/sessions.js';
import { MediaStorage } from '../../packages/domain/src/media/storage.js';
import { applyRetention } from '../../packages/domain/src/retention.js';
import { staffFixture } from './staff-fixture.js';

describe('conversation admission, turns, tools and public links', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let identity: IdentityService;
  let conversations: ConversationService;
  let live: ConversationService;
  let links: AssistantLinkService;
  let publics: PublicAssistants;
  let sessions: ConversationSessions;
  let devices: DeviceService;
  let runtime: DeviceRuntime;
  let schedules: ScheduleService;
  let commands: DeviceCommands;
  let release: {
    id: string;
    snapshot: {
      knowledge: { id: string }[];
      presentation: { slides: { id: string }[] } | null;
    };
  };
  let second: { id: string };
  let root: string;
  let now = new Date(Math.ceil(Date.now() / 60_000) * 60_000 + 3_600_000);
  const clock = () => new Date(now);
  const staffActor = (): ConversationActor => ({ kind: 'STAFF', token: staff.owner.token });
  let turnNumber = 1;
  const turn = (extra: Record<string, unknown> = {}) => ({
    generation: turnNumber++,
    clientMessageId: randomUUID(),
    locale: 'en-US',
    text: 'Where is admissions?',
    ...extra,
  });

  beforeAll(async () => {
    staff = await staffFixture();
    identity = new IdentityService(staff.db, staff.pepper);
    runtime = new DeviceRuntime(staff.db, staff.pepper, clock);
    devices = new DeviceService(identity, staff.pepper, clock);
    schedules = new ScheduleService(identity, clock);
    commands = new DeviceCommands(runtime, clock);
    const options = { providerMode: 'fixture' as const, pepper: staff.pepper, clock };
    conversations = new ConversationService(staff.db, identity, runtime, options);
    live = new ConversationService(staff.db, identity, runtime, {
      ...options,
      providerMode: 'live',
    });
    links = new AssistantLinkService(identity, clock);
    root = await mkdtemp(join(tmpdir(), 'svara-conversations-'));
    publics = new PublicAssistants(
      staff.db,
      await MediaStorage.open(root),
      { pepper: staff.pepper, providerMode: 'fixture' },
      clock,
    );
    sessions = new ConversationSessions(identity, clock);
    const token = staff.owner.token;
    const bots = new BotService(identity);
    const created = await bots.create(token, { name: 'Admissions guide' });
    const bot = await bots.save(token, created.id, {
      name: created.name,
      description: '',
      expectedRevision: created.revision,
      draft: {
        ...emptyBotDraft(),
        persona: 'Help visitors.',
        greeting: { en: 'Welcome.', ne: 'स्वागत छ।' },
        fallback: { en: 'Ask reception.', ne: 'स्वागत कक्षमा सोध्नुहोस्।' },
        tools: ['lookup_knowledge', 'select_reference', 'show_slide', 'get_event_schedule'],
      },
    });
    const knowledge = new KnowledgeService(identity);
    const entry = await knowledge.create(token, bot.id, { title: 'Admissions', type: 'FAQ' });
    const saved = await knowledge.save(token, entry.id, {
      expectedRevision: entry.revision,
      title: entry.title,
      type: 'FAQ',
      question: { en: 'Where is admissions?', ne: 'भर्ना कहाँ छ?' },
      content: { en: 'Admissions is in room 12.', ne: 'भर्ना कोठा १२ मा छ।' },
    });
    await knowledge.approve(token, saved.id, { expectedRevision: saved.revision, approved: true });
    const presentations = new PresentationService(identity);
    const deck = await presentations.create(token, { botId: bot.id, name: 'Open house' });
    await presentations.createSlide(token, deck.id, {
      expectedRevision: deck.revision,
      title: { en: 'Admissions steps', ne: 'भर्ना चरणहरू' },
      body: { en: 'Apply, then visit room 12.', ne: 'आवेदन दिनुहोस्।' },
      target: 'SECONDARY',
    });
    const releases = new ReleaseService(identity, { providerMode: 'fixture' });
    const revision = async () => (await bots.get(token, bot.id)).revision;
    release = await releases.publish(
      token,
      bot.id,
      { expectedRevision: await revision() },
      randomUUID(),
    );
    second = await releases.publish(
      token,
      bot.id,
      { expectedRevision: await revision() },
      randomUUID(),
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    if (!staff) return;
    const organisations = await staff.db.organisation.findMany({
      where: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
      select: { id: true },
    });
    const where = { organisationId: { in: organisations.map((org) => org.id) } };
    await staff.db.toolExecution.deleteMany({ where });
    await staff.db.conversationTurn.deleteMany({ where });
    await staff.db.conversationSession.deleteMany({ where });
    await staff.db.visitorGrant.deleteMany({ where });
    await staff.db.assistantLink.deleteMany({ where });
    await staff.db.dailyUsage.deleteMany({ where });
    await staff.db.deviceCommand.deleteMany({ where });
    await staff.db.desiredDeviceState.deleteMany({ where });
    await staff.db.deployment.deleteMany({ where });
    await staff.db.deviceGrant.deleteMany({ where });
    await staff.db.deviceTicket.deleteMany({ where });
    await staff.db.deviceCredential.deleteMany({ where });
    await staff.db.pairingChallenge.deleteMany({ where });
    await staff.db.device.deleteMany({ where });
    await staff.db.idempotencyRecord.deleteMany({ where });
    await staff.db.botRelease.deleteMany({ where });
    await staff.db.botDraft.updateMany({ where, data: { presentationId: null } });
    await staff.db.bot.deleteMany({ where });
    await staff.close();
  });

  /** A paired kiosk whose primary window has applied `releaseId` through an override. */
  async function kiosk(releaseId = release.id) {
    const device = await devices.create(staff.owner.token, { name: `Kiosk ${randomUUID()}` });
    const challenge = await devices.createPairing(staff.owner.token, device.id, {
      expectedRevision: device.revision,
    });
    const credential = await runtime.pair({ challengeId: challenge.id, code: challenge.code });
    const primary = await runtime.redeemTicket(
      (await runtime.issueTicket(credential.token, { namespace: '/devices', role: 'PRIMARY' }))
        .ticket,
      { namespace: '/devices', role: 'PRIMARY' },
    );
    const actor: ConversationActor = { kind: 'DEVICE', token: credential.token };
    await expect(conversations.admit(actor, { locale: 'en-US' })).rejects.toMatchObject({
      code: 'NOT_READY',
    });
    const override = await schedules.override(staff.owner.token, device.id, {
      releaseId,
      minutes: 30,
    });
    const apply = async () => {
      const snapshot = await commands.snapshot(primary);
      await commands.acknowledge(primary, {
        commandId: snapshot.commandId,
        appliedRevision: snapshot.revision,
        result: 'APPLIED',
      });
    };
    // Desired but not yet applied is still not ready to talk.
    await expect(conversations.admit(actor, { locale: 'en-US' })).rejects.toMatchObject({
      code: 'NOT_READY',
    });
    await apply();
    return { device, credential, primary, actor, override, apply };
  }

  it('pins each actor to its own release and keeps one open session per actor', async () => {
    await expect(conversations.admit(staffActor(), { locale: 'en-US' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(
      conversations.admit(staffActor(), { locale: 'en-US', releaseId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const first = await conversations.admit(staffActor(), {
      locale: 'en-US',
      releaseId: release.id,
    });
    expect(first.session).toMatchObject({ actorKind: 'STAFF', status: 'ACTIVE', generation: 0 });
    expect(first.tools).toEqual(['lookup_knowledge', 'select_reference']);
    const replacement = await conversations.admit(staffActor(), {
      locale: 'ne-NP',
      releaseId: release.id,
    });
    const old = await staff.db.conversationSession.findUniqueOrThrow({
      where: { id: first.session.id },
    });
    expect(old).toMatchObject({ status: 'ENDED', endReason: 'REPLACED' });
    const station = await kiosk();
    const device = await conversations
      .admit(station.actor, {
        locale: 'en-US',
        releaseId: release.id,
      })
      .catch((error: unknown) => error);
    expect(device).toMatchObject({ code: 'INVALID_INPUT' });
    const admitted = await conversations.admit(station.actor, { locale: 'en-US' });
    expect(admitted.session.releaseId).toBe(release.id);
    expect(admitted.tools).toEqual(expect.arrayContaining(['show_slide', 'get_event_schedule']));
    // A foreign organisation cannot see or drive either session.
    const foreign = await staff.service.register({
      email: `foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign Owner',
      organisationName: 'Foreign Conversation Campus',
    });
    await expect(sessions.get(foreign.token, replacement.session.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      conversations.beginTurn(
        { kind: 'STAFF', token: foreign.token },
        replacement.session.id,
        turn(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      conversations.beginTurn(station.actor, replacement.session.id, turn()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects stale generations and duplicate messages, and a newer turn interrupts the last', async () => {
    const { session } = await conversations.admit(staffActor(), {
      locale: 'en-US',
      releaseId: release.id,
    });
    const first = await conversations.beginTurn(staffActor(), session.id, turn({ generation: 10 }));
    expect(first).toMatchObject({ question: 'Where is admissions?', generation: 10 });
    const replay = turn({ generation: 10 });
    await expect(conversations.beginTurn(staffActor(), session.id, replay)).rejects.toMatchObject({
      code: 'STALE_GENERATION',
    });
    const message = randomUUID();
    const next = await conversations.beginTurn(
      staffActor(),
      session.id,
      turn({ generation: 11, clientMessageId: message }),
    );
    await expect(
      conversations.beginTurn(
        staffActor(),
        session.id,
        turn({ generation: 12, clientMessageId: message }),
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_MESSAGE' });
    // The superseded turn keeps INTERRUPTED even when its runner finishes late.
    await conversations.finishTurn(first, {
      state: 'COMPLETED',
      answer: 'Admissions is in',
      citedEntryIds: [],
      failureCode: null,
      timings: {},
    });
    const stored = await staff.db.conversationTurn.findUniqueOrThrow({
      where: { id: first.turnId },
    });
    expect(stored).toMatchObject({ state: 'INTERRUPTED', answer: 'Admissions is in' });
    await conversations.finishTurn(next, {
      state: 'COMPLETED',
      answer: 'Admissions is in room 12.',
      citedEntryIds: [],
      failureCode: null,
      timings: { totalMs: 900 },
    });
    const third = await conversations.beginTurn(staffActor(), session.id, turn({ generation: 13 }));
    expect(third.history).toEqual([
      { role: 'user', text: 'Where is admissions?' },
      { role: 'assistant', text: 'Admissions is in room 12.' },
    ]);
    const interrupted = await conversations.interrupt(staffActor(), session.id, { generation: 14 });
    expect(interrupted.generation).toBe(14);
    expect(
      await staff.db.conversationTurn.findUniqueOrThrow({ where: { id: third.turnId } }),
    ).toMatchObject({ state: 'INTERRUPTED' });
    await expect(
      staff.db.conversationSession.update({ where: { id: session.id }, data: { generation: 1 } }),
    ).rejects.toThrow();
  });

  it('validates tool calls: allowlist, release scope, generation and one effect per call ID', async () => {
    const station = await kiosk();
    const { session } = await conversations.admit(station.actor, { locale: 'en-US' });
    const context = await conversations.beginTurn(
      station.actor,
      session.id,
      turn({ generation: 1 }),
    );
    const slideId = release.snapshot.presentation!.slides[0]!.id;
    await expect(
      conversations.tool(station.actor, context, {
        callId: 'bad',
        name: 'delete_everything',
        args: {},
      }),
    ).resolves.toMatchObject({ status: 'REJECTED', reason: 'TOOL_NOT_ALLOWED', id: '' });
    await expect(
      conversations.tool(station.actor, context, {
        callId: 'unknown',
        name: 'show_slide',
        args: { slideId: randomUUID() },
      }),
    ).resolves.toMatchObject({ status: 'REJECTED', reason: 'UNKNOWN_SLIDE' });
    await expect(
      conversations.tool(station.actor, context, {
        callId: 'wrong-screen',
        name: 'show_slide',
        args: { slideId, target: 'PRIMARY' },
      }),
    ).resolves.toMatchObject({ status: 'REJECTED', reason: 'WRONG_SCREEN' });
    const shown = await conversations.tool(station.actor, context, {
      callId: 'show-1',
      name: 'show_slide',
      args: { slideId },
    });
    expect(shown).toMatchObject({ status: 'PENDING', result: { slideId, target: 'SECONDARY' } });
    const again = await conversations.tool(station.actor, context, {
      callId: 'show-1',
      name: 'show_slide',
      args: { slideId },
    });
    expect(again).toMatchObject({ duplicate: true, command: shown.command });
    expect(
      await staff.db.deviceCommand.count({
        where: { deviceId: station.device.id, type: 'slide.show' },
      }),
    ).toBe(1);
    const entryId = release.snapshot.knowledge[0]!.id;
    await expect(
      conversations.tool(station.actor, context, {
        callId: 'reference',
        name: 'select_reference',
        args: { entryId },
      }),
    ).resolves.toMatchObject({ status: 'DONE', result: { entryId, title: 'Admissions' } });
    // Four recorded calls per turn; the fifth has no effect.
    await expect(
      conversations.tool(station.actor, context, {
        callId: 'limit',
        name: 'select_reference',
        args: { entryId },
      }),
    ).resolves.toMatchObject({ status: 'REJECTED', reason: 'TOOL_LIMIT' });
    // The kiosk's acknowledgement settles the call but never moves the applied release revision.
    const before = await staff.db.desiredDeviceState.findUniqueOrThrow({
      where: { deviceId: station.device.id },
    });
    expect(await conversations.slideOutcome(shown.id)).toBe('PENDING');
    await commands.acknowledge(station.primary, {
      commandId: shown.command!.id,
      appliedRevision: shown.command!.stateRevision,
      result: 'APPLIED',
    });
    expect(await conversations.slideOutcome(shown.id)).toBe('APPLIED');
    expect(
      await staff.db.desiredDeviceState.findUniqueOrThrow({
        where: { deviceId: station.device.id },
      }),
    ).toEqual(before);
    // A call arriving after an interruption belongs to a dead generation and has no effect.
    const late = await conversations.beginTurn(station.actor, session.id, turn({ generation: 2 }));
    await conversations.interrupt(station.actor, session.id, { generation: 3 });
    await expect(
      conversations.tool(station.actor, late, {
        callId: 'late',
        name: 'show_slide',
        args: { slideId },
      }),
    ).resolves.toMatchObject({ status: 'REJECTED', reason: 'STALE_GENERATION' });
    expect(
      await staff.db.deviceCommand.count({
        where: { deviceId: station.device.id, type: 'slide.show' },
      }),
    ).toBe(1);
  });

  it('ends kiosk sessions when the deployed release changes or the device is revoked', async () => {
    const station = await kiosk();
    const { session } = await conversations.admit(station.actor, { locale: 'en-US' });
    await schedules.override(staff.owner.token, station.device.id, {
      releaseId: second.id,
      minutes: 30,
      replaceOverrideId: station.override.id,
    });
    expect(
      await staff.db.conversationSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).toMatchObject({ status: 'ENDED', endReason: 'RELEASE_CHANGED' });
    await expect(conversations.admit(station.actor, { locale: 'en-US' })).rejects.toMatchObject({
      code: 'NOT_READY',
    });
    await station.apply();
    const next = await conversations.admit(station.actor, { locale: 'en-US' });
    expect(next.session.releaseId).toBe(second.id);
    const device = await devices.get(staff.owner.token, station.device.id);
    await devices.revoke(staff.owner.token, station.device.id, {
      expectedRevision: device.revision,
    });
    expect(
      await staff.db.conversationSession.findUniqueOrThrow({ where: { id: next.session.id } }),
    ).toMatchObject({ status: 'ENDED', endReason: 'DEVICE_REVOKED' });
    await expect(
      conversations.beginTurn(station.actor, next.session.id, turn()),
    ).rejects.toMatchObject({ code: 'DEVICE_UNAUTHENTICATED' });
  });

  it('publishes links that expose no knowledge and close their sessions when disabled', async () => {
    await expect(
      links.create(staff.owner.token, { releaseId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'RELEASE_UNAVAILABLE' });
    const link = await links.create(staff.owner.token, {
      releaseId: release.id,
      label: 'Open day',
    });
    expect(link).toMatchObject({ enabled: true, releaseVersion: 1, activeSessions: 0 });
    const config = await publics.config(link.slug);
    expect(config.suggestions.en).toEqual(['Where is admissions?']);
    expect(JSON.stringify(config)).not.toContain('Admissions is in room 12.');
    const grant = await publics.grant(link.slug);
    const visitor: ConversationActor = { kind: 'VISITOR', slug: link.slug, token: grant.token };
    const admitted = await conversations.admit(visitor, { locale: 'ne-NP' });
    expect(admitted.tools).not.toContain('show_slide');
    const context = await conversations.beginTurn(visitor, admitted.session.id, turn());
    await expect(
      conversations.tool(visitor, context, {
        callId: 'visitor-slide',
        name: 'show_slide',
        args: { slideId: release.snapshot.presentation!.slides[0]!.id },
      }),
    ).resolves.toMatchObject({ status: 'REJECTED', reason: 'TOOL_NOT_ALLOWED' });
    // A grant only works for its own link.
    const other = await links.create(staff.owner.token, { releaseId: release.id });
    await expect(
      conversations.admit({ ...visitor, slug: other.slug }, { locale: 'en-US' }),
    ).rejects.toMatchObject({ code: 'VISITOR_UNAUTHENTICATED' });
    await expect(publics.media(link.slug, randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      links.save(staff.owner.token, link.id, {
        releaseId: release.id,
        label: 'Open day',
        enabled: false,
        expiresAt: null,
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_REQUIRED' });
    const disabled = await links.save(staff.owner.token, link.id, {
      releaseId: release.id,
      label: 'Open day',
      enabled: false,
      expiresAt: null,
      expectedRevision: link.revision,
    });
    expect(disabled).toMatchObject({ enabled: false, revision: 2, activeSessions: 0 });
    expect(
      await staff.db.conversationSession.findUniqueOrThrow({ where: { id: admitted.session.id } }),
    ).toMatchObject({ status: 'ENDED', endReason: 'LINK_DISABLED' });
    await expect(conversations.admit(visitor, { locale: 'en-US' })).rejects.toMatchObject({
      code: 'LINK_UNAVAILABLE',
    });
    await expect(publics.config(link.slug)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(publics.grant(link.slug)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('enforces live daily limits under concurrent admission and settles on close or expiry', async () => {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const organisationId = staff.owner.identity.organisation.id;
    await staff.db.conversationSession.updateMany({
      where: { organisationId, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: now, endReason: 'ENDED' },
    });
    await staff.db.dailyUsage.upsert({
      where: { organisationId_usageDate: { organisationId, usageDate: day } },
      create: { organisationId, usageDate: day, liveSessions: 0, reservedSeconds: 3000 },
      update: { liveSessions: 0, reservedSeconds: 3000 },
    });
    // 600 seconds remain: exactly two five-minute reservations fit.
    const link = await links.create(staff.owner.token, { releaseId: release.id });
    const visitors = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const grant = await publics.grant(link.slug);
        return { kind: 'VISITOR' as const, slug: link.slug, token: grant.token };
      }),
    );
    const results = await Promise.allSettled(
      visitors.map((visitor) => live.admit(visitor, { locale: 'en-US' })),
    );
    const admitted = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    expect(admitted).toHaveLength(2);
    expect(
      results.filter((result) => result.status === 'rejected').map((result) => result.reason.code),
    ).toEqual(['DAILY_LIMIT', 'DAILY_LIMIT']);
    const usage = () =>
      staff.db.dailyUsage.findUniqueOrThrow({
        where: { organisationId_usageDate: { organisationId, usageDate: day } },
      });
    expect(await usage()).toMatchObject({ liveSessions: 2, reservedSeconds: 3600 });
    // An ordinary close after 30 seconds returns the unused 270.
    now = new Date(now.getTime() + 30_000);
    const owner = visitors[results.findIndex((result) => result.status === 'fulfilled')]!;
    await live.end(owner, admitted[0]!.session.id);
    expect(await usage()).toMatchObject({ reservedSeconds: 3330 });
    // An abandoned session expires and keeps its whole reservation.
    now = new Date(now.getTime() + 10 * 60_000);
    expect(await live.expireStale()).toBeGreaterThanOrEqual(1);
    expect(
      await staff.db.conversationSession.findUniqueOrThrow({
        where: { id: admitted[1]!.session.id },
      }),
    ).toMatchObject({ status: 'ENDED', endReason: 'EXPIRED', settledSeconds: 300 });
    expect(await usage()).toMatchObject({ reservedSeconds: 3330 });
  });

  it('resumes only the same actor’s interrupted conversation, restoring its finished turns', async () => {
    const { session } = await conversations.admit(staffActor(), {
      locale: 'en-US',
      releaseId: release.id,
    });
    const answered = await conversations.beginTurn(staffActor(), session.id, turn());
    await conversations.finishTurn(answered, {
      state: 'COMPLETED',
      answer: 'Admissions is in room 12.',
      citedEntryIds: [],
      failureCode: null,
      timings: {},
    });
    const cut = await conversations.beginTurn(
      staffActor(),
      session.id,
      turn({ text: 'And fees?' }),
    );
    await conversations.finishTurn(cut, {
      state: 'INTERRUPTED',
      answer: 'Fees are',
      citedEntryIds: [],
      failureCode: null,
      timings: {},
    });
    const station = await kiosk();
    await expect(
      conversations.admit(station.actor, { locale: 'en-US', resumeFrom: session.id }),
    ).rejects.toMatchObject({ code: 'RESUME_UNAVAILABLE' });
    const resumed = await conversations.admit(staffActor(), {
      locale: 'en-US',
      releaseId: release.id,
      resumeFrom: session.id,
    });
    expect(resumed.session.resumedFromId).toBe(session.id);
    expect(resumed.history).toEqual([
      {
        locale: 'en-US',
        question: 'Where is admissions?',
        answer: 'Admissions is in room 12.',
        state: 'COMPLETED',
      },
      { locale: 'en-US', question: 'And fees?', answer: 'Fees are', state: 'INTERRUPTED' },
    ]);
    // The next answer is grounded in the restored, finished exchange only.
    const next = await conversations.beginTurn(staffActor(), resumed.session.id, turn());
    expect(next.history).toEqual([
      { role: 'user', text: 'Where is admissions?' },
      { role: 'assistant', text: 'Admissions is in room 12.' },
    ]);
  });

  it('lets staff inspect sessions and only owners and administrators delete transcripts', async () => {
    now = new Date(now.getTime() + 1000);
    const { session } = await conversations.admit(staffActor(), {
      locale: 'en-US',
      releaseId: release.id,
    });
    const context = await conversations.beginTurn(staffActor(), session.id, turn());
    await conversations.finishTurn(context, {
      state: 'COMPLETED',
      answer: 'Admissions is in room 12.',
      citedEntryIds: [],
      failureCode: null,
      timings: { firstTextMs: 120, totalMs: 400 },
    });
    const page = await sessions.list(staff.owner.token, { limit: '5' });
    expect(page.items[0]).toMatchObject({ id: session.id, turns: 1, botName: 'Admissions guide' });
    const detail = await sessions.get(staff.owner.token, session.id);
    expect(detail.turnList[0]).toMatchObject({
      question: 'Where is admissions?',
      answer: 'Admissions is in room 12.',
      timings: { firstTextMs: 120, totalMs: 400, sttMs: null },
    });
    const membership = staff.owner.identity.membership.id;
    await staff.db.membership.update({ where: { id: membership }, data: { role: 'VIEWER' } });
    try {
      expect((await sessions.get(staff.owner.token, session.id)).id).toBe(session.id);
      await expect(sessions.deleteTranscript(staff.owner.token, session.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    } finally {
      await staff.db.membership.update({ where: { id: membership }, data: { role: 'OWNER' } });
    }
    const deleted = await sessions.deleteTranscript(staff.owner.token, session.id);
    expect(deleted).toMatchObject({ status: 'ENDED', transcriptDeleted: true });
    expect(deleted.turnList[0]).toMatchObject({ question: '', answer: '' });
    await expect(
      conversations.admit(staffActor(), {
        locale: 'en-US',
        releaseId: release.id,
        resumeFrom: session.id,
      }),
    ).rejects.toMatchObject({ code: 'RESUME_UNAVAILABLE' });
  });

  it('expires old transcripts and unreferenced credentials, keeping counts and timings', async () => {
    now = new Date(now.getTime() + 1000);
    const { session } = await conversations.admit(staffActor(), {
      locale: 'en-US',
      releaseId: release.id,
    });
    const context = await conversations.beginTurn(staffActor(), session.id, turn());
    await conversations.finishTurn(context, {
      state: 'COMPLETED',
      answer: 'Admissions is in room 12.',
      citedEntryIds: [release.snapshot.knowledge[0]!.id],
      failureCode: null,
      timings: { firstTextMs: 90, totalMs: 300 },
    });
    await conversations.end(staffActor(), session.id);
    const day = 86_400_000;
    const old = new Date(Date.now() - 31 * day);
    const recent = await conversations.admit(staffActor(), {
      locale: 'en-US',
      releaseId: release.id,
    });
    await conversations.end(staffActor(), recent.session.id);
    await staff.db.conversationSession.update({
      where: { id: session.id },
      data: { endedAt: old },
    });
    // Pairing codes issued eight days ago: an abandoned one goes, a redeemed one stays.
    const past = () => new Date(Date.now() - 8 * day);
    const pastDevices = new DeviceService(identity, staff.pepper, past);
    const pair = async () => {
      const device = await pastDevices.create(staff.owner.token, { name: `Old ${randomUUID()}` });
      return pastDevices.createPairing(staff.owner.token, device.id, {
        expectedRevision: device.revision,
      });
    };
    const unused = await pair();
    const redeemed = await pair();
    await new DeviceRuntime(staff.db, staff.pepper, past).pair({
      challengeId: redeemed.id,
      code: redeemed.code,
    });

    const outcome = await applyRetention(staff.db);
    expect(outcome.transcripts).toBeGreaterThanOrEqual(1);
    const expired = await sessions.get(staff.owner.token, session.id);
    expect(expired).toMatchObject({ transcriptDeleted: true, turns: 1 });
    expect(expired.turnList[0]).toMatchObject({
      question: '',
      answer: '',
      citedEntryIds: [],
      state: 'COMPLETED',
      timings: { firstTextMs: 90, totalMs: 300 },
    });
    expect((await sessions.get(staff.owner.token, recent.session.id)).transcriptDeleted).toBe(
      false,
    );
    expect(
      await staff.db.auditEntry.count({
        where: { targetId: session.id, action: 'conversation.transcript.expired' },
      }),
    ).toBe(1);
    const codes = await staff.db.pairingChallenge.findMany({
      where: { id: { in: [unused.id, redeemed.id] } },
    });
    expect(codes.map((code) => code.id)).toEqual([redeemed.id]);
    // A second pass finds nothing more of this session to remove.
    await applyRetention(staff.db);
    expect(
      await staff.db.auditEntry.count({
        where: { targetId: session.id, action: 'conversation.transcript.expired' },
      }),
    ).toBe(1);
  });
});
