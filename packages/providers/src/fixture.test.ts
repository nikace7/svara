import { describe, expect, it } from 'vitest';
import { FixtureAnswerGenerator, fixtureScenario } from './fixture.js';
import type { AnswerInput } from './index.js';

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

describe('demo-mode answers', () => {
  const run = async (input: Partial<AnswerInput>, locale: 'en-US' | 'ne-NP' = 'en-US') => {
    const chunks = [];
    for await (const chunk of new FixtureAnswerGenerator().generate(
      { question: 'Where is admissions?', passages: [], history: [], ...input },
      { locale, mode: 'fixture', signal: new AbortController().signal },
    ))
      chunks.push(chunk);
    return chunks;
  };
  const showSlide = {
    name: 'show_slide',
    description: 'Show a slide.',
    parameters: { slide: { description: 'Slide label' } },
    required: ['slide'],
  };

  it('quotes the top approved passage with its label, or says nothing is approved', async () => {
    expect(await run({ passages: [{ id: '1', text: 'Admissions\nWhere?\nRoom 12.' }] })).toEqual([
      'Demo mode: Room 12. [1]',
    ]);
    expect(await run({}, 'ne-NP')).toEqual(['डेमो मोड: यस संस्करणमा यसको स्वीकृत उत्तर छैन।']);
  });

  it('proposes show_slide only when offered and a slide title matches', async () => {
    const slides = [{ label: 'S1', title: 'Admissions steps' }];
    expect(await run({ question: 'Show admissions', slides, tools: [showSlide] })).toEqual([
      { type: 'tool', callId: 'fixture-show-slide', name: 'show_slide', args: { slide: 'S1' } },
    ]);
    expect(await run({ question: 'Show admissions', slides })).toEqual([
      'Demo mode: this release has no approved answer to that.',
    ]);
    const round = (status: string) => ({
      calls: [],
      results: [{ callId: 'x', name: 'show_slide', result: { status } }],
    });
    expect(await run({ toolRound: round('APPLIED') })).toEqual([
      'Demo mode: the slide is on screen.',
    ]);
    expect(await run({ toolRound: round('REJECTED') })).toEqual([
      'Demo mode: that slide could not be shown.',
    ]);
  });
});
