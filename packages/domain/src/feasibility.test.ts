import { describe, expect, it } from 'vitest';
import { runFixtureTurn } from './feasibility.js';

describe('real fixture pipeline lifecycle', () => {
  const options = { delayMs: 0 };
  it.each(['en-US', 'ne-NP'] as const)(
    'streams the %s scripted answer with truthful audio status',
    async (locale) => {
      const events = await Array.fromAsync(
        runFixtureTurn(
          { locale, generation: 1, scenario: 'supported_faq' },
          new AbortController().signal,
          options,
        ),
      );
      expect(events[0]?.type).toBe('transcript');
      expect(events.at(-1)?.type).toBe('complete');
      expect(
        events.every(
          (event, seq) =>
            event.seq === seq && event.generation === 1 && event.audio === 'unavailable',
        ),
      ).toBe(true);
      expect(events.map((x) => x.text).join('')).toContain(
        locale === 'ne-NP' ? 'भर्ना' : 'admissions',
      );
      expect(events.every((x) => x.elapsedMs >= 0)).toBe(true);
    },
  );
  it('does not answer arbitrary typed questions using scripted facts', async () => {
    const events = await Array.fromAsync(
      runFixtureTurn(
        { locale: 'en-US', generation: 1, text: 'Where is admissions?' },
        new AbortController().signal,
        options,
      ),
    );
    expect(
      events
        .filter((x) => x.type === 'answer')
        .map((x) => x.text)
        .join(''),
    ).toContain('Fixture mode');
    expect(
      events
        .filter((x) => x.type === 'answer')
        .map((x) => x.text)
        .join(''),
    ).not.toContain('A-101');
  });
  it.each(['tts_failure', 'provider_quota'] as const)(
    'ends %s with a stage-specific error',
    async (scenario) => {
      const events = await Array.fromAsync(
        runFixtureTurn(
          { locale: 'en-US', generation: 1, scenario },
          new AbortController().signal,
          options,
        ),
      );
      expect(events.at(-1)?.type).toBe('error');
      expect(events.some((x) => x.type === 'complete')).toBe(false);
    },
  );
  it('stops producing events immediately after cancellation', async () => {
    const controller = new AbortController();
    const stream = runFixtureTurn(
      { locale: 'en-US', generation: 1, scenario: 'interrupt_answer' },
      controller.signal,
      options,
    );
    await stream.next();
    controller.abort();
    await expect(stream.next()).rejects.toMatchObject({ name: 'AbortError' });
  });
});
