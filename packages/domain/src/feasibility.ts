import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { FeasibilityEvent, FeasibilityRequest } from '@svara/contracts';
import { fixtureScenario, SentenceSegments } from '@svara/providers';

export async function* runFixtureTurn(
  request: FeasibilityRequest,
  signal: AbortSignal,
  options: { delayMs?: number } = {},
): AsyncGenerator<FeasibilityEvent> {
  signal.throwIfAborted();
  const started = performance.now();
  const turnId = randomUUID();
  let seq = 0;
  const event = (
    type: FeasibilityEvent['type'],
    text: string,
    code?: FeasibilityEvent['code'],
  ): FeasibilityEvent => ({
    v: 1,
    turnId,
    generation: request.generation,
    seq: seq++,
    elapsedMs: performance.now() - started,
    type,
    text,
    providerMode: 'fixture',
    audio: 'unavailable',
    ...(code ? { code } : {}),
  });
  const scenario = fixtureScenario(request);
  if (scenario.failure === 'PROVIDER_QUOTA') {
    yield event(
      'error',
      'Simulated provider quota reached. Try another scenario.',
      scenario.failure,
    );
    return;
  }
  yield event('transcript', scenario.question);
  const splitter = new SentenceSegments();
  for (const segment of [...splitter.push(scenario.answer), ...splitter.finish()]) {
    signal.throwIfAborted();
    await delay(options.delayMs ?? 180, undefined, { signal });
    signal.throwIfAborted();
    yield event('answer', segment);
  }
  signal.throwIfAborted();
  if (scenario.failure)
    yield event(
      'error',
      'Simulated speech failure. Read the answer or retry in text-only mode.',
      scenario.failure,
    );
  else yield event('complete', 'Text-only fixture completed. No speech audio is available.');
}
