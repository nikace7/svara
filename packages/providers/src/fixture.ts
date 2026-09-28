import type { FeasibilityRequest } from '@svara/contracts';
import type { AnswerChunk, AnswerGenerator, AnswerInput, ProviderContext } from './index.js';

/**
 * Demo mode without a provider: quotes the top approved passage verbatim, labelled as demo
 * output, and proposes show_slide when the question names a slide. It never composes facts.
 */
export class FixtureAnswerGenerator implements AnswerGenerator {
  async *generate(input: AnswerInput, context: ProviderContext): AsyncIterable<AnswerChunk> {
    await Promise.resolve();
    context.signal.throwIfAborted();
    const nepali = context.locale === 'ne-NP';
    const prefix = nepali ? 'डेमो मोड:' : 'Demo mode:';
    if (input.toolRound) {
      const status = input.toolRound.results
        .map((result) => (result.result as { status?: string } | null)?.status)
        .find(Boolean);
      yield status === 'APPLIED'
        ? nepali
          ? `${prefix} स्लाइड पर्दामा देखाइएको छ।`
          : `${prefix} the slide is on screen.`
        : status === 'PENDING'
          ? nepali
            ? `${prefix} स्लाइड पर्दामा पठाइएको छ।`
            : `${prefix} the slide was sent to the screen.`
          : nepali
            ? `${prefix} त्यो स्लाइड देखाउन सकिएन।`
            : `${prefix} that slide could not be shown.`;
      return;
    }
    const question = input.question.toLocaleLowerCase();
    const slide = input.tools?.some((tool) => tool.name === 'show_slide')
      ? input.slides?.find((item) =>
          item.title
            .toLocaleLowerCase()
            .split(/\s+/)
            .some((word) => word.length >= 4 && question.includes(word)),
        )
      : undefined;
    if (slide) {
      yield {
        type: 'tool',
        callId: 'fixture-show-slide',
        name: 'show_slide',
        args: { slide: slide.label },
      };
      return;
    }
    const passage = input.passages[0];
    if (!passage) {
      yield nepali
        ? `${prefix} यस संस्करणमा यसको स्वीकृत उत्तर छैन।`
        : `${prefix} this release has no approved answer to that.`;
      return;
    }
    const content = passage.text.split('\n').at(-1)!.trim().slice(0, 220);
    yield `${prefix} ${content} [${passage.id}]`;
  }
}

/** Original synthetic content. No recorded/synthesized speech clip is supplied. */
export function fixtureScenario(request: FeasibilityRequest): {
  question: string;
  answer: string;
  failure?: 'TTS_UNAVAILABLE' | 'PROVIDER_QUOTA';
} {
  const nepali = request.locale === 'ne-NP';
  if (request.text !== undefined)
    return {
      question: request.text,
      answer: nepali
        ? 'यो नमुना मोड हो। लेखिएको प्रश्नको वास्तविक उत्तर दिन सकिँदैन। तयार गरिएको उदाहरण छान्नुहोस्।'
        : 'Fixture mode does not answer typed questions. Choose a scripted scenario to test the pipeline.',
    };
  if (request.scenario === 'unsupported_question')
    return {
      question: nepali ? 'भर्ना शुल्क कति हो?' : 'What is the admission fee?',
      answer: nepali
        ? 'नमुना जानकारीमा शुल्क उल्लेख गरिएको छैन। कृपया भर्ना कार्यालयमा सोध्नुहोस्।'
        : 'The demo information does not include fees. Please ask the admissions office.',
    };
  const question = nepali ? 'भर्ना कार्यालय कहाँ छ?' : 'Where is the admissions office?';
  const sentence = nepali
    ? 'नमुना भर्ना कार्यालय कोठा A-101 मा छ। आवेदन फाराम साथमा ल्याउनुहोस्।'
    : 'The demo admissions office is in Room A-101. Please bring your application form.';
  return {
    question,
    answer:
      request.scenario === 'interrupt_answer'
        ? Array.from({ length: 8 }, () => sentence).join(' ')
        : sentence,
    ...(request.scenario === 'tts_failure' ? { failure: 'TTS_UNAVAILABLE' as const } : {}),
    ...(request.scenario === 'provider_quota' ? { failure: 'PROVIDER_QUOTA' as const } : {}),
  };
}
