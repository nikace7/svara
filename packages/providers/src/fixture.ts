import type { FeasibilityRequest } from '@svara/contracts';

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
