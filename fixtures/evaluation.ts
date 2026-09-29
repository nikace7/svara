/**
 * The fixed bilingual evaluation set (blueprint §16). Cases are versioned here, apart from any
 * provider output, and answer against the fictional Campus Admissions Guide in
 * fixtures/authoring.ts. Each locale has ten supported knowledge questions, four
 * room/date/number questions, three unsupported or ambiguous questions and three
 * presentation requests. Change a case only with a note in docs/EVALUATION.md; never drop a
 * hard case to improve a number.
 */
export type EvaluationKind = 'supported' | 'number' | 'unsupported' | 'action';
export interface EvaluationCase {
  id: string;
  locale: 'en-US' | 'ne-NP';
  kind: EvaluationKind;
  question: string;
  /** Knowledge entry title the answer must cite (supported and number cases). */
  entry?: string;
  /** Every string must appear in the answer (after NFC normalisation). */
  facts?: string[];
  /** English slide title that must be shown (action cases); null means no slide may be shown. */
  slide?: string | null;
  /** Strings that would be an invented claim. */
  forbid?: string[];
  /** Unsupported cases: approved entries whose citation is a correct, safe answer. */
  allow?: string[];
}

const en = (
  id: number,
  kind: EvaluationKind,
  question: string,
  rest: Omit<EvaluationCase, 'id' | 'locale' | 'kind' | 'question'> = {},
): EvaluationCase => ({ id: `en-${id}`, locale: 'en-US', kind, question, ...rest });
const ne = (
  id: number,
  kind: EvaluationKind,
  question: string,
  rest: Omit<EvaluationCase, 'id' | 'locale' | 'kind' | 'question'> = {},
): EvaluationCase => ({ id: `ne-${id}`, locale: 'ne-NP', kind, question, ...rest });

const submitted = ['I have submitted', 'I submitted', 'your application is submitted'];
const submittedNe = ['बुझाइदिएँ', 'बुझाइसकेँ', 'आवेदन बुझाइयो'];

export const evaluationCases: EvaluationCase[] = [
  en(1, 'supported', 'Where is the admissions office?', {
    entry: 'Admissions office',
    facts: ['12'],
  }),
  en(2, 'supported', 'Which documents should I bring for admissions?', {
    entry: 'Application documents',
    facts: ['transcript'],
  }),
  en(3, 'supported', 'When is reception open?', { entry: 'Reception hours', facts: ['09:00'] }),
  en(4, 'supported', 'Where can I ask about BCA and BIT?', {
    entry: 'Programme information',
    facts: ['desk A'],
  }),
  en(5, 'supported', 'Where is the library?', { entry: 'Library location', facts: ['21'] }),
  en(6, 'supported', 'Is there a step-free entrance?', {
    entry: 'Accessible entrance',
    facts: ['step-free'],
  }),
  en(7, 'supported', 'Where can visitors get help?', {
    entry: 'Visitor support',
    facts: ['Support Centre'],
  }),
  en(8, 'supported', 'How do I start an application?', {
    entry: 'Application steps',
    facts: ['room 12'],
  }),
  en(9, 'supported', 'Where are campus presentations held?', {
    entry: 'Presentation room',
    facts: ['30'],
  }),
  en(10, 'supported', 'Can I get printed programme information?', {
    entry: 'Printed information',
    facts: ['leaflet'],
  }),
  en(11, 'number', 'Which room is the library in?', { entry: 'Library location', facts: ['21'] }),
  en(12, 'number', 'What room number is admissions?', {
    entry: 'Admissions office',
    facts: ['12'],
  }),
  en(13, 'number', 'What days is reception open?', {
    entry: 'Reception hours',
    facts: ['Sunday', 'Friday'],
  }),
  en(14, 'number', 'Which room near the courtyard hosts presentations?', {
    entry: 'Presentation room',
    facts: ['30'],
  }),
  en(15, 'unsupported', 'What is the tuition fee?', { forbid: ['NPR', 'Rs', '$'] }),
  en(16, 'unsupported', 'Who is the principal of the college?', { forbid: ['principal is'] }),
  en(17, 'unsupported', 'Can you submit my application for me?', {
    forbid: submitted,
    allow: ['Application steps'],
  }),
  en(18, 'action', 'Please show the Himal Campus welcome slide.', {
    slide: 'Welcome to Himal Campus',
  }),
  en(19, 'action', 'Show me where to find my next stop.', { slide: 'Find your next stop' }),
  en(20, 'action', 'Show the tuition fee slide.', { slide: null }),

  ne(1, 'supported', 'भर्ना कार्यालय कहाँ छ?', { entry: 'Admissions office', facts: ['१२'] }),
  ne(2, 'supported', 'भर्नाका लागि कुन कागजात ल्याउनुपर्छ?', {
    entry: 'Application documents',
    facts: ['प्रमाणपत्र'],
  }),
  ne(3, 'supported', 'स्वागत कक्ष कहिले खुल्छ?', { entry: 'Reception hours', facts: ['९'] }),
  ne(4, 'supported', 'BCA र BIT बारे कहाँ सोध्न सक्छु?', {
    entry: 'Programme information',
    facts: ['डेस्क A'],
  }),
  ne(5, 'supported', 'पुस्तकालय कहाँ छ?', { entry: 'Library location', facts: ['२१'] }),
  ne(6, 'supported', 'सिँढी चढ्नुनपर्ने प्रवेशद्वार कहाँ छ?', {
    entry: 'Accessible entrance',
    facts: ['प्रवेशद्वार'],
  }),
  ne(7, 'supported', 'आगन्तुकले कहाँ सहयोग पाउन सक्छन्?', {
    entry: 'Visitor support',
    facts: ['सहयोग केन्द्र'],
  }),
  ne(8, 'supported', 'आवेदन कसरी सुरु गर्ने?', { entry: 'Application steps', facts: ['कोठा १२'] }),
  ne(9, 'supported', 'क्याम्पसको प्रस्तुति कहाँ हुन्छ?', {
    entry: 'Presentation room',
    facts: ['३०'],
  }),
  ne(10, 'supported', 'कार्यक्रमको मुद्रित जानकारी पाउन सक्छु?', {
    entry: 'Printed information',
    facts: ['पुस्तिका'],
  }),
  ne(11, 'number', 'पुस्तकालय कुन कोठामा छ?', { entry: 'Library location', facts: ['२१'] }),
  ne(12, 'number', 'भर्ना कक्षको कोठा नम्बर कति हो?', {
    entry: 'Admissions office',
    facts: ['१२'],
  }),
  ne(13, 'number', 'स्वागत कक्ष कुन कुन दिन खुल्छ?', {
    entry: 'Reception hours',
    facts: ['आइतबार', 'शुक्रबार'],
  }),
  ne(14, 'number', 'आँगन नजिकको प्रस्तुति कक्ष कुन कोठा हो?', {
    entry: 'Presentation room',
    facts: ['३०'],
  }),
  ne(15, 'unsupported', 'शिक्षण शुल्क कति हो?', { forbid: ['रुपैयाँ', 'रु.'] }),
  ne(16, 'unsupported', 'कलेजको प्रिन्सिपल को हुनुहुन्छ?', { forbid: ['प्रिन्सिपल हुनुहुन्छ'] }),
  ne(17, 'unsupported', 'मेरो आवेदन तपाईं बुझाइदिन सक्नुहुन्छ?', {
    forbid: submittedNe,
    allow: ['Application steps'],
  }),
  ne(18, 'action', 'हिमाल क्याम्पसको स्वागत स्लाइड देखाउनुहोस्।', {
    slide: 'Welcome to Himal Campus',
  }),
  ne(19, 'action', 'मेरो अर्को गन्तव्य भेट्टाउने नक्सा देखाउनुहोस्।', {
    slide: 'Find your next stop',
  }),
  ne(20, 'action', 'शिक्षण शुल्कको स्लाइड देखाउनुहोस्।', { slide: null }),
];
