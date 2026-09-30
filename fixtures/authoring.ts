import { emptyBotDraft } from '../packages/contracts/src/authoring.js';
import type { BotDraft } from '../packages/contracts/src/authoring.js';
import type { LocalAuthoringBundle } from '../packages/domain/src/local/authoring.js';

export const demoAuthoringIds = {
  admissions: '10000000-0000-4000-8000-000000000101',
  events: '10000000-0000-4000-8000-000000000102',
  riverside: '20000000-0000-4000-8000-000000000101',
} as const;

type Entry = LocalAuthoringBundle['bots'][number]['knowledge'][number];
type Slide = LocalAuthoringBundle['bots'][number]['presentations'][number]['slides'][number];
const bilingual = (en: string, ne: string) => ({ en, ne });
function faq(title: string, en: string, ne: string, answerEn: string, answerNe: string): Entry {
  return {
    title,
    type: 'FAQ',
    question: bilingual(en, ne),
    content: bilingual(`Demo information: ${answerEn}`, `नमुना जानकारी: ${answerNe}`),
    approved: true,
    selected: true,
  };
}
function note(title: string, en: string, ne: string): Entry {
  return {
    title,
    type: 'NOTE',
    question: bilingual('', ''),
    content: bilingual(`Fictional demo note. ${en}`, `काल्पनिक नमुना टिपोट। ${ne}`),
    approved: true,
    selected: true,
  };
}
function slide(
  en: string,
  ne: string,
  bodyEn: string,
  bodyNe: string,
  mediaKey: string | null = null,
  target: Slide['target'] = 'BOTH',
): Slide {
  return {
    title: bilingual(en, ne),
    body: bilingual(bodyEn, bodyNe),
    mediaKey,
    target,
    durationSeconds: 15,
  };
}
const admissionsFaqs: Entry[] = [
  faq(
    'Admissions office',
    'Where is the admissions office?',
    'भर्ना कार्यालय कहाँ छ?',
    'The admissions desk is in room 12, beside the entrance lobby.',
    'भर्ना कक्ष प्रवेशद्वारको लबी नजिकैको कोठा १२ मा छ।',
  ),
  faq(
    'Application documents',
    'Which documents should I bring for admissions?',
    'भर्नाका लागि कुन कागजात ल्याउनुपर्छ?',
    'Bring your latest academic transcript, an identity document and two passport-size photographs. Staff at room 12 can explain the demonstration checklist.',
    'पछिल्लो शैक्षिक प्रमाणपत्र, परिचयपत्र र दुई प्रति पासपोर्ट आकारको फोटो ल्याउनुहोस्। कोठा १२ का कर्मचारीले नमुना सूची बुझाउनुहुन्छ।',
  ),
  faq(
    'Reception hours',
    'When is reception open?',
    'स्वागत कक्ष कहिले खुल्छ?',
    'Reception is open Sunday to Friday, 09:00–16:00 in the sample timetable.',
    'नमुना समयतालिकामा स्वागत कक्ष आइतबारदेखि शुक्रबार बिहान ९ बजेदेखि बेलुका ४ बजेसम्म खुल्छ।',
  ),
  faq(
    'Programme information',
    'Where can I ask about BCA and BIT?',
    'BCA र BIT बारे कहाँ सोध्न सक्छु?',
    'Ask the programme adviser at desk A in room 12. This demo does not determine eligibility or promise admission.',
    'कोठा १२ को डेस्क A मा कार्यक्रम सल्लाहकारलाई सोध्नुहोस्। यो नमुनाले योग्यता निर्धारण वा भर्नाको वाचा गर्दैन।',
  ),
  faq(
    'Library location',
    'Where is the library?',
    'पुस्तकालय कहाँ छ?',
    'The library is in room 21 along the east corridor. Ask reception before entering staff-only areas.',
    'पुस्तकालय पूर्वतर्फको गल्लीमा रहेको कोठा २१ मा छ। कर्मचारीका लागि छुट्याइएको क्षेत्रमा प्रवेश गर्नुअघि स्वागत कक्षमा सोध्नुहोस्।',
  ),
  faq(
    'Accessible entrance',
    'Where is the step-free entrance?',
    'सिँढी चढ्न नपर्ने प्रवेशद्वार कहाँ छ?',
    'The sample map shows a step-free entrance beside reception. Ask a staff member for assistance with the route.',
    'नमुना नक्सामा स्वागत कक्षको छेउमा सिँढी चढ्न नपर्ने प्रवेशद्वार देखाइएको छ। बाटोबारे सहयोगका लागि कर्मचारीलाई सोध्नुहोस्।',
  ),
  faq(
    'Visitor support',
    'Where can visitors get help?',
    'आगन्तुकले कहाँ सहयोग पाउन सक्छन्?',
    'Visit the Student and Visitor Information Support Centre at reception. A staff member can help you find the right desk.',
    'स्वागत कक्षमा रहेको विद्यार्थी तथा आगन्तुक सूचना, परामर्श र सहयोग केन्द्रमा जानुहोस्। कर्मचारीले सम्बन्धित कक्ष भेट्टाउन मद्दत गर्नुहुन्छ।',
  ),
  faq(
    'Application steps',
    'How do I start an application?',
    'आवेदन कसरी सुरु गर्ने?',
    'First visit room 12, then collect the sample checklist, and finally ask an adviser to review your documents. No application is submitted by this guide.',
    'पहिले कोठा १२ मा जानुहोस्, त्यसपछि नमुना सूची लिनुहोस् र अन्त्यमा सल्लाहकारलाई कागजात देखाउनुहोस्। यो गाइडले आवेदन बुझाउँदैन।',
  ),
  faq(
    'Presentation room',
    'Where are campus presentations held?',
    'क्याम्पसको प्रस्तुति कहाँ हुन्छ?',
    'Demonstration presentations take place in room 30, near the courtyard.',
    'नमुना प्रस्तुति आँगन नजिकैको कोठा ३० मा हुन्छ।',
  ),
  faq(
    'Printed information',
    'Can I get printed programme information?',
    'कार्यक्रमको मुद्रित जानकारी पाउन सक्छु?',
    'Ask reception for the fictional programme leaflet. Availability is confirmed by staff.',
    'काल्पनिक कार्यक्रमको पुस्तिकाका लागि स्वागत कक्षमा सोध्नुहोस्। उपलब्धता कर्मचारीले बताउनुहुन्छ।',
  ),
];
const eventFaqs: Entry[] = [
  faq(
    'Open-house time',
    'What time does the open house start?',
    'खुला दिवस कति बजे सुरु हुन्छ?',
    'The sample open-house programme starts at 13:00, with a campus tour at 13:30 and questions at 14:00. The actual event date will be shown in the event schedule when one is configured.',
    'नमुना खुला दिवस दिउँसो १ बजे सुरु हुन्छ। क्याम्पस भ्रमण १:३० बजे र प्रश्नोत्तर २ बजे हुन्छ। कार्यक्रम तय भएपछि मिति कार्यक्रमको समयतालिकामा देखाइनेछ।',
  ),
  faq(
    'Open-house registration',
    'Where do I check in for the open house?',
    'खुला दिवसका लागि कहाँ नाम दर्ता गर्ने?',
    'Check in at the registration desk in the entrance lobby. This assistant does not register attendance.',
    'प्रवेशद्वारको लबीमा रहेको दर्ता कक्षमा जानुहोस्। यो सहायकले हाजिरी दर्ता गर्दैन।',
  ),
];
const admissionsNotes: Entry[] = [
  note(
    'Campus map legend',
    'This schematic is not to scale. Room 12 is admissions, room 21 is the library and room 30 hosts presentations. The marked route begins at reception.',
    'यो सांकेतिक नक्सा वास्तविक अनुपातमा छैन। कोठा १२ भर्ना कक्ष, कोठा २१ पुस्तकालय र कोठा ३० प्रस्तुति कक्ष हो। देखाइएको बाटो स्वागत कक्षबाट सुरु हुन्छ।',
  ),
  note(
    'Programme acronyms and numbers',
    'Use BCA and BIT as programme labels. Read room numbers 12, 21 and 30 clearly. This content describes a fictional campus, not real admissions policy.',
    'BCA र BIT कार्यक्रमका नाम हुन्। कोठा नम्बर १२, २१ र ३० स्पष्ट पढ्नुहोस्। यो सामग्री काल्पनिक क्याम्पसको हो, वास्तविक भर्ना नीति होइन।',
  ),
  note(
    'Staff handoff',
    'When the selected knowledge cannot answer a visitor, direct them to reception. Do not invent missing details or claim to complete an application.',
    'छानिएको जानकारीबाट उत्तर दिन नसकिए आगन्तुकलाई स्वागत कक्षमा पठाउनुहोस्। नदिइएको विवरण नबनाउनुहोस् र आवेदन पूरा गरेको दाबी नगर्नुहोस्।',
  ),
];
const eventNotes: Entry[] = [
  note(
    'Open-house outline',
    'The sample programme has three stages: welcome at 13:00, a tour at 13:30, and questions at 14:00. These times are examples; no scheduled deployment or event is created by this seed.',
    'नमुना कार्यक्रममा तीन चरण छन्: दिउँसो १ बजे स्वागत, १:३० बजे भ्रमण र २ बजे प्रश्नोत्तर। यी समय उदाहरण हुन्। यो नमुना सामग्रीले कुनै तालिका वा कार्यक्रम सिर्जना गर्दैन।',
  ),
];

function config(greetingEn: string, greetingNe: string): BotDraft {
  return {
    ...emptyBotDraft(),
    persona:
      'You are a helpful guide for a fictional demonstration. Use only this release’s selected knowledge. Say when information is missing and refer visitors to reception. Never claim to submit an application or make a booking.',
    greeting: bilingual(greetingEn, greetingNe),
    fallback: bilingual(
      'This detail is not in the demo information. Please ask reception.',
      'यो विवरण नमुना जानकारीमा छैन। कृपया स्वागत कक्षमा सोध्नुहोस्।',
    ),
  };
}

/** Static fictional data. Only the checked-in original map bytes are supplied by the CLI. */
export function demoAuthoringBundles(map: Uint8Array): LocalAuthoringBundle[] {
  const admissionsConfig = {
    ...config(
      'Welcome to the Himal Campus demo. How can I help?',
      'हिमाल क्याम्पसको नमुना कार्यक्रममा स्वागत छ। म कसरी सहयोग गर्न सक्छु?',
    ),
    tools: ['lookup_knowledge', 'select_reference', 'show_slide'] as BotDraft['tools'],
  };
  return [
    {
      organisationId: '10000000-0000-4000-8000-000000000001',
      actorUserId: '10000000-0000-4000-8000-000000000011',
      media: [
        {
          key: 'campus-map',
          filename: 'Himal campus map — fictional demo.png',
          mimeType: 'image/png',
          bytes: map,
        },
      ],
      bots: [
        {
          id: demoAuthoringIds.admissions,
          name: 'Campus Admissions Guide',
          description:
            'Fictional demo · Published version 1 is complete. The current draft deliberately needs a Nepali greeting.',
          config: admissionsConfig,
          publish: true,
          afterPublishDraft: {
            ...admissionsConfig,
            greeting: { ...admissionsConfig.greeting, ne: '' },
          },
          knowledge: [
            ...admissionsFaqs,
            ...admissionsNotes,
            {
              ...faq(
                'Fee details — awaiting review',
                'What is the tuition fee?',
                'शिक्षण शुल्क कति हो?',
                'This draft is awaiting review. No fee amount has been supplied.',
                'यो मस्यौदा समीक्षाको पर्खाइमा छ। शुल्कको रकम दिइएको छैन।',
              ),
              approved: false,
              selected: false,
            },
          ],
          presentations: [
            {
              name: 'Welcome',
              selected: true,
              slides: [
                slide(
                  'Welcome to Himal Campus',
                  'हिमाल क्याम्पसमा स्वागत छ',
                  'Fictional demo · Start at reception, room 12.',
                  'काल्पनिक नमुना · कोठा १२ को स्वागत कक्षबाट सुरु गर्नुहोस्।',
                ),
                slide(
                  'Find your next stop',
                  'आफ्नो गन्तव्य भेट्टाउनुहोस्',
                  'Demo map · Admissions 12 / Library 21 / Presentations 30.',
                  'नमुना नक्सा · भर्ना कक्ष १२ / पुस्तकालय २१ / प्रस्तुति कक्ष ३०।',
                  'campus-map',
                  'SECONDARY',
                ),
              ],
            },
            {
              name: 'Admissions steps',
              selected: false,
              slides: [
                slide(
                  'Three simple steps',
                  'तीन सरल चरण',
                  '1. Visit room 12.\n2. Collect the sample checklist.\n3. Ask an adviser to review your documents.',
                  '१. कोठा १२ मा जानुहोस्।\n२. नमुना सूची लिनुहोस्।\n३. सल्लाहकारलाई कागजात देखाउनुहोस्।',
                ),
              ],
            },
            {
              name: 'Office hours',
              selected: false,
              slides: [
                slide(
                  'Reception hours',
                  'स्वागत कक्षको समय',
                  'Demo timetable · Sunday–Friday, 09:00–16:00.',
                  'नमुना समयतालिका · आइतबार–शुक्रबार, बिहान ९–बेलुका ४ बजे।',
                ),
              ],
            },
            {
              name: 'Room map',
              selected: false,
              slides: [
                slide(
                  'Campus at a glance',
                  'क्याम्पसको संक्षिप्त नक्सा',
                  'Original fictional schematic. Not to scale.',
                  'मौलिक काल्पनिक सांकेतिक नक्सा। वास्तविक अनुपातमा छैन।',
                  'campus-map',
                ),
              ],
            },
          ],
        },
        {
          id: demoAuthoringIds.events,
          name: 'Campus Event Host',
          description: 'Fictional open-house programme. No event or deployment has been scheduled.',
          config: config(
            'Welcome to the campus open-house demo.',
            'क्याम्पसको नमुना खुला दिवसमा स्वागत छ।',
          ),
          publish: false,
          knowledge: [...eventFaqs, ...eventNotes],
          presentations: [
            {
              name: 'Open-house schedule',
              selected: true,
              slides: [
                slide(
                  'Open-house programme',
                  'खुला दिवसको कार्यक्रम',
                  'Example times · Welcome 13:00 / Tour 13:30 / Questions 14:00.',
                  'नमुना समय · स्वागत १ बजे / भ्रमण १:३० बजे / प्रश्नोत्तर २ बजे।',
                ),
                slide(
                  'Questions are welcome',
                  'प्रश्नहरू सोध्न सक्नुहुन्छ',
                  'Visit the registration desk in the entrance lobby.',
                  'प्रवेशद्वारको लबीमा रहेको दर्ता कक्षमा जानुहोस्।',
                ),
              ],
            },
          ],
        },
      ],
    },
    {
      organisationId: '20000000-0000-4000-8000-000000000001',
      actorUserId: '20000000-0000-4000-8000-000000000011',
      media: [],
      bots: [
        {
          id: demoAuthoringIds.riverside,
          name: 'Riverside Exhibition Guide',
          description: 'A separate fictional organisation used to demonstrate workspace isolation.',
          config: config(
            'Welcome to the Riverside exhibition demo.',
            'रिभरसाइडको नमुना प्रदर्शनीमा स्वागत छ।',
          ),
          publish: false,
          knowledge: [
            faq(
              'Exhibition help desk',
              'Where is the exhibition help desk?',
              'प्रदर्शनीको सहायता कक्ष कहाँ छ?',
              'The Riverside help desk is in Hall B. This exhibition is separate from the Himal Campus demo.',
              'रिभरसाइडको सहायता कक्ष हल B मा छ। यो प्रदर्शनी हिमाल क्याम्पसको नमुना कार्यक्रमभन्दा फरक हो।',
            ),
          ],
          presentations: [
            {
              name: 'Exhibition welcome',
              selected: true,
              slides: [
                slide(
                  'Discover Riverside',
                  'रिभरसाइड हेर्नुहोस्',
                  'Fictional exhibition · Ask at Hall B for visitor information.',
                  'काल्पनिक प्रदर्शनी · आगन्तुकको जानकारीका लागि हल B मा सोध्नुहोस्।',
                ),
              ],
            },
          ],
        },
      ],
    },
  ];
}
