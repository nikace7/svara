/**
 * pnpm eval:conversations [--live]
 *
 * Runs the fixed bilingual set (fixtures/evaluation.ts) through the real admission, retrieval,
 * turn runner, tool validation and citation checks, as a paired kiosk, against a fresh
 * synthetic organisation in the test database. The release is the fictional Campus
 * Admissions Guide from fixtures/authoring.ts (without its map image).
 *
 * Default: demo mode. FixtureAnswerGenerator quotes the top retrieved passage, so the numbers
 * measure retrieval, grounding, fallback and tool authority, not a language model.
 * --live: the configured Gemini model answers (text only, at most 80 generation requests;
 * needs PROVIDER_MODE=live and GEMINI_API_KEY). Results are written to
 * artifacts/evaluation/<mode>-<time>.json. Nepali answers still need a human reviewer.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadWorkspaceEnvironment, parseServerConfig } from '../packages/config/src/server.js';
import { createDatabase } from '../packages/database/src/index.js';
import { assertTestDatabase } from '../packages/database/src/safety.js';
import {
  BotService,
  ConversationService,
  DeviceCommands,
  DeviceRuntime,
  DeviceService,
  IdentityService,
  KnowledgeService,
  PresentationService,
  ReleaseService,
  ScheduleService,
  runConversationTurn,
} from '../packages/domain/src/index.js';
import type { ConversationActor, TurnRunner } from '../packages/domain/src/index.js';
// The same build the domain resolves `@svara/providers` to: from src, GeminiError is another
// class and quota failures fail `instanceof`, so they are recorded as PROVIDER_UNAVAILABLE.
import { FixtureAnswerGenerator, GeminiAnswerGenerator } from '../packages/providers/dist/index.js';
import { demoAuthoringBundles } from '../fixtures/authoring.js';
import { evaluationCases } from '../fixtures/evaluation.js';
import type { EvaluationCase } from '../fixtures/evaluation.js';

loadWorkspaceEnvironment();
const live = process.argv.includes('--live');
const url = process.env.TEST_DATABASE_URL ?? '';
assertTestDatabase(url, 'test');
const config = live ? parseServerConfig(process.env) : undefined;
if (live && (config?.PROVIDER_MODE !== 'live' || !config.GEMINI_API_KEY))
  throw new Error('--live needs PROVIDER_MODE=live and GEMINI_API_KEY.');

const db = createDatabase(url);
const pepper = randomBytes(48).toString('hex');
const identity = new IdentityService(db, pepper);
const runtime = new DeviceRuntime(db, pepper);
const commands = new DeviceCommands(runtime);

/** A synthetic owner, the admissions guide published once, and a kiosk that applied it. */
async function setUp() {
  const owner = await identity.register({
    email: `owner-${randomUUID()}@evaluation.example.test`,
    password: randomBytes(18).toString('base64url'),
    displayName: 'Evaluation owner',
    organisationName: 'Evaluation campus (fictional)',
  });
  const token = owner.token;
  const guide = demoAuthoringBundles(new Uint8Array()).at(0)!.bots.at(0)!;
  const bots = new BotService(identity);
  const created = await bots.create(token, { name: guide.name });
  await bots.save(token, created.id, {
    name: guide.name,
    description: '',
    expectedRevision: created.revision,
    draft: guide.config,
  });
  const knowledge = new KnowledgeService(identity);
  for (const item of guide.knowledge) {
    const entry = await knowledge.create(token, created.id, { title: item.title, type: item.type });
    const saved = await knowledge.save(token, entry.id, {
      expectedRevision: entry.revision,
      title: item.title,
      type: item.type,
      question: item.question,
      content: item.content,
    });
    if (item.approved)
      await knowledge.approve(token, saved.id, {
        expectedRevision: saved.revision,
        approved: true,
      });
    // The unapproved fee draft stays out of the release, exactly as in the demo seed.
    if (!item.selected)
      await knowledge.select(token, saved.id, {
        expectedRevision: saved.revision,
        selected: false,
      });
  }
  const presentations = new PresentationService(identity);
  const source = guide.presentations.find((deck) => deck.selected)!;
  let deck = await presentations.create(token, { botId: created.id, name: source.name });
  for (const slide of source.slides)
    deck = await presentations.createSlide(token, deck.id, {
      expectedRevision: deck.revision,
      title: slide.title,
      body: slide.body,
      target: slide.target,
    });
  const release = await new ReleaseService(identity, {
    providerMode: live ? 'live' : 'fixture',
  }).publish(
    token,
    created.id,
    { expectedRevision: (await bots.get(token, created.id)).revision },
    randomUUID(),
  );

  const device = await new DeviceService(identity, pepper).create(token, {
    name: 'Evaluation kiosk',
  });
  const challenge = await new DeviceService(identity, pepper).createPairing(token, device.id, {
    expectedRevision: device.revision,
  });
  const credential = await runtime.pair({ challengeId: challenge.id, code: challenge.code });
  const role = { namespace: '/devices', role: 'PRIMARY' } as const;
  const primary = await runtime.redeemTicket(
    (await runtime.issueTicket(credential.token, role)).ticket,
    role,
  );
  await new ScheduleService(identity).override(token, device.id, {
    releaseId: release.id,
    minutes: 60,
  });
  const snapshot = await commands.snapshot(primary);
  await commands.acknowledge(primary, {
    commandId: snapshot.commandId,
    appliedRevision: snapshot.revision,
    result: 'APPLIED',
  });
  return { release, primary, actor: { kind: 'DEVICE', token: credential.token } as const };
}

const normal = (text: string) => text.normalize('NFC');
const includes = (text: string, part: string) =>
  normal(text).toLocaleLowerCase().includes(normal(part).toLocaleLowerCase());

async function main() {
  const { release, primary, actor } = await setUp();
  const conversations = new ConversationService(db, identity, runtime, {
    providerMode: live ? 'live' : 'fixture',
    pepper,
  });
  const runner: TurnRunner = {
    service: conversations,
    providers: {
      generator: config
        ? new GeminiAnswerGenerator({
            apiKey: config.GEMINI_API_KEY!,
            model: config.GEMINI_MODEL,
            ttsModel: config.GEMINI_TTS_MODEL,
            sttModel: config.GEMINI_STT_MODEL,
            voice: config.GEMINI_VOICE,
            retries: 1,
          })
        : new FixtureAnswerGenerator(),
    },
    // The evaluation kiosk applies every slide it is sent, as a healthy kiosk would.
    slides: {
      show: (_deviceId, command) =>
        void commands.acknowledge(primary, {
          commandId: command.id,
          appliedRevision: command.stateRevision,
          result: 'APPLIED',
        }),
    },
  };
  const titles = new Map(release.snapshot.knowledge.map((entry) => [entry.id, entry.title]));
  const slides = new Map(
    (release.snapshot.presentation?.slides ?? []).map((slide) => [slide.id, slide.title.en]),
  );

  const results = [];
  for (const item of evaluationCases) results.push(await run(item));
  async function run(item: EvaluationCase) {
    const { session } = await conversations.admit(actor as ConversationActor, {
      locale: item.locale,
    });
    const context = await conversations.beginTurn(actor, session.id, {
      generation: 1,
      clientMessageId: randomUUID(),
      locale: item.locale,
      text: item.question,
    });
    // The turn row is the record; the streamed events are not needed here.
    const events = runConversationTurn(actor, context, runner, AbortSignal.timeout(60_000));
    while (!(await events.next()).done);
    await conversations.end(actor, session.id);
    const turn = await db.conversationTurn.findUniqueOrThrow({
      where: { id: context.turnId },
      include: { tools: true },
    });
    const cited = turn.citedEntryIds.map((id) => titles.get(id) ?? `unknown:${id}`);
    const executed = turn.tools.filter((tool) => tool.status !== 'REJECTED');
    const shown = executed
      .filter((tool) => tool.name === 'show_slide')
      .map((tool) => slides.get((tool.result as { slideId?: string } | null)?.slideId ?? ''));
    const invented = (item.forbid ?? []).filter((text) => includes(turn.answer, text));
    const pass =
      item.kind === 'unsupported'
        ? cited.every((title) => item.allow?.includes(title)) && invented.length === 0
        : item.kind === 'action'
          ? item.slide === null
            ? shown.length === 0
            : shown.includes(item.slide)
          : cited.includes(item.entry!) &&
            (item.facts ?? []).every((f) => includes(turn.answer, f));
    return {
      id: item.id,
      kind: item.kind,
      locale: item.locale,
      question: item.question,
      pass,
      state: turn.state,
      failureCode: turn.failureCode,
      answer: turn.answer,
      cited,
      tools: turn.tools.map((tool) => `${tool.name}:${tool.status}`),
      unexpectedTools: item.kind === 'action' ? [] : executed.map((tool) => tool.name),
      unauthorized: shown.filter((title) => title === undefined).length,
      invented,
      firstTextMs: turn.firstTextMs,
      totalMs: turn.totalMs,
    };
  }

  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const mode = live ? 'live' : 'fixture';
  await mkdir('artifacts/evaluation', { recursive: true });
  const file = `artifacts/evaluation/${mode}-${stamp}.json`;
  await writeFile(
    file,
    `${JSON.stringify({ mode, model: config?.GEMINI_MODEL ?? null, results }, null, 2)}\n`,
  );
  for (const locale of ['en-US', 'ne-NP'] as const) {
    const mine = results.filter((result) => result.locale === locale);
    const score = (kinds: string[]) => {
      const set = mine.filter((result) => kinds.includes(result.kind));
      return `${set.filter((result) => result.pass).length}/${set.length}`;
    };
    console.info(
      `${locale} ${mode}: answerable ${score(['supported', 'number'])}, unsupported safe ${score(['unsupported'])}, actions ${score(['action'])}, unexpected tool calls ${mine.reduce((n, r) => n + r.unexpectedTools.length, 0)}, unauthorized ${mine.reduce((n, r) => n + r.unauthorized, 0)}, not completed ${mine.filter((r) => r.state !== 'COMPLETED').length}`,
    );
    const failed = mine.filter((result) => !result.pass).map((result) => result.id);
    if (failed.length) console.info(`  failed: ${failed.join(', ')}`);
  }
  console.info(`Results: ${file}`);
  // Quality misses are reported, not hidden; safety failures fail the run.
  const unsafe = results.filter((result) => result.unauthorized > 0 || result.invented.length);
  if (unsafe.length) {
    console.error(`Unsafe results: ${unsafe.map((result) => result.id).join(', ')}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await db.$disconnect();
}
