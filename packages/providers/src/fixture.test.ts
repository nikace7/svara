import { describe, expect, it } from 'vitest';
import { fixtureScenario } from './fixture.js';

describe('synthetic scenario provenance', () => {
  it.each(['en-US', 'ne-NP'] as const)(
    'keeps %s supported, unknown and arbitrary questions distinct',
    (locale) => {
      const base = { locale, generation: 1 };
      const supported = fixtureScenario({ ...base, scenario: 'supported_faq' });
      expect(supported.answer).toContain('A-101');
      const unsupported = fixtureScenario({ ...base, scenario: 'unsupported_question' });
      expect(unsupported.answer).not.toContain('A-101');
      const typed = fixtureScenario({ ...base, text: 'A real question' });
      expect(typed.question).toBe('A real question');
      expect(typed.answer).not.toContain('A-101');
      expect(
        fixtureScenario({ ...base, scenario: 'interrupt_answer' }).answer.length,
      ).toBeGreaterThan(supported.answer.length * 5);
      expect(fixtureScenario({ ...base, scenario: 'tts_failure' }).failure).toBe('TTS_UNAVAILABLE');
      expect(fixtureScenario({ ...base, scenario: 'provider_quota' }).failure).toBe(
        'PROVIDER_QUOTA',
      );
    },
  );
});
