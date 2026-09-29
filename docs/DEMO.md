# Demo walkthrough and screenshots

A five-minute demonstration of Svara on the fictional Himal Campus, and the screenshot set
that shows the same behaviour. Everything here runs without a provider account. Each
screen that answers questions says **Demo mode**, and the studio sidebar says **Fixture
mode**. Nothing in the screenshots was edited, and no transcript or metric was made up.

## Before you start

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm demo:up
```

Open <http://localhost:4320>. The seeded staff passwords are in the ignored
`.local/setup/demo-staff.json`. Use a second browser profile for the kiosk and a phone-width
window (or a phone on the same machine) for the visitor. [Fictional demo content](DEMO-CONTENT.md)
lists what the seed creates.

## Five-minute walkthrough

Scenario IDs refer to the [evaluation set](EVALUATION.md) and to the screenshots below.

| Time      | Step                                                                                                                                                                                                                                                                                                                                                                                                       | Shows  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 0:00–0:40 | Sign in as the Himal owner. Point out the fictional organisation, **Settings → Team** roles, and **Events & Deployments**, where each device shows its desired release and whether it applied it.                                                                                                                                                                                                          | 01     |
| 0:40–1:30 | **Bots → Campus Admissions Guide → Knowledge → Admissions office**: English and Nepali side by side, both complete, approved. Then **Releases → Version 1**: numbered and immutable, with the draft's missing Nepali greeting flagged by the readiness check.                                                                                                                                              | 02     |
| 1:30–2:15 | **Presentation**: the slide outline with previews for both screens. **Devices → Pair**, enter the code in the kiosk profile, then **Open display**. Start an override in **Events & Deployments**; the kiosk verifies and applies the release and the board says **Applied on device**.                                                                                                                    | 03, 05 |
| 2:15–3:15 | On the kiosk: "Where is the admissions office?" (en-1). The answer names its source. "Please show the Himal Campus welcome slide." (en-18): the slide moves, and the answer reports it only after the kiosk acknowledges. Switch to नेपाली and ask "भर्ना कार्यालय कहाँ छ?" (ne-1). Ask "Who is the principal of the college?" (en-16) to show the approved fallback.                                      | 04, 07 |
| 3:15–4:00 | Ask "Where is admissions? Give me a long answer." and press **Stop speaking**. Speech is off in demo mode, so stopping ends the text stream. With a live key it also stops audio at once. Then take the kiosk offline (browser dev tools → Network → Offline): it says it is unavailable. Go back online and it reconnects, keeping finished answers.                                                      | —      |
| 4:00–4:40 | Back in **Events & Deployments**, open the kiosk's **Delivery history**. It lists the release command and the slide command, both acknowledged, with their revision. **End override** returns the kiosk to its schedule or idle with a newer revision.                                                                                                                                                     | 05     |
| 4:40–5:00 | **Sessions**: the kiosk conversation with citations, the slide outcome and measured timings. **Analytics** keeps demo and live measurements apart and labels a stage "Insufficient: n of 5 samples" rather than showing a number from fewer than five. Say plainly that everything shown ran in demo mode; the one real-key result is the M1 gate in [evaluation](EVALUATION.md#2-live-provider-evidence). | 06     |

## Screenshot set

Captured by `pnpm screenshots:handoff` on 2026-09-29. It rebuilds the demo from scratch
through the product's HTTP API on the test stack, in fixture mode. Originals are PNG in
`artifacts/screenshots/handoff/`, with WebP copies beside them. Desktop screens are
1920×1200. The visitor screen is 390×844 at device scale 2. The folder is not committed:
run the command to recreate it.

| File                       | Caption                                                                                                                                                                                    | Alt text                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-fleet-overview`        | The fleet board: the lobby kiosk runs Campus Admissions Guide v1 through an override and has acknowledged applying it. A second device, never paired, sits idle. Fixture mode is labelled. | Events and Deployments page listing two devices. Library display: now idle, nothing scheduled. Lobby kiosk: now Campus Admissions Guide v1 (override), badge "Applied on device", an active override row.                   |
| `02-bilingual-knowledge`   | A knowledge entry with both languages complete and approved, and included in the next release.                                                                                             | Knowledge editor for "Admissions office" with English and Nepali tabs both marked complete, the English question and answer, and a review panel showing approved and included in release.                                   |
| `03-presentation-editor`   | The welcome presentation: ordered slides, the primary and secondary screen previews, and the selected slide's bilingual properties.                                                        | Presentation editor with two slides in an outline, previews of "Welcome to Himal Campus" for the primary and secondary screens, and slide properties with English and Nepali tabs.                                          |
| `04-voice-and-command`     | On the kiosk, a cited answer and then a slide request. "Slide: applied" appears only after the kiosk acknowledged the command. Demo mode is labelled.                                      | Kiosk screen showing the welcome slide and a conversation panel: a question about the admissions office answered with room 12 and its source, then a slide request answered "the slide is on screen" with "Slide: applied". |
| `05-deployment-recovery`   | The override with the kiosk's delivery history: the release command and the slide command, both acknowledged, one delivery each.                                                           | Events and Deployments page with the lobby kiosk's delivery history open, listing "show slide" and "apply release" commands, each acknowledged with revision and time.                                                      |
| `06-session-inspector`     | The kiosk session as staff see it: questions, answers, the cited entry, the slide tool outcome and measured timings. Speech shows as unavailable because demo mode has none.               | Session detail for the lobby kiosk with two typed questions, their answers, "Cited 1 approved entry", "Tool show_slide: APPLIED, kiosk applied it", and timing columns in milliseconds.                                     |
| `07-visitor-mobile-nepali` | A visitor on a phone asks in Nepali through a public link and gets the authored Nepali answer with its source. Slide titles and text appear in both languages.                             | Phone-width public assistant in Nepali: a question about the admissions office, a Devanagari answer naming room १२, its source, the question box, and the welcome slide in English and Nepali.                              |

### Known gaps visible in the set

- Speech is off in every capture because demo mode has no voice provider. The blueprint's
  "subtitles" are the sentence-by-sentence answer text; there is no separate timed
  subtitle track (A24 in [evaluation](EVALUATION.md#3-acceptance-matrix-blueprint-15)).
- Citation labels use the entry's internal title, which is English only, even on the
  Nepali screen ("स्रोत: Admissions office").

## Reproduce

```sh
pnpm build                 # the capture stack serves the production web build
pnpm screenshots:handoff   # resets svara_test, captures, writes PNG and WebP
pnpm eval:conversations    # the fixed bilingual evaluation, demo mode
```

Both need the native PostgreSQL and Redis from `pnpm infra:up`. They use only the
`svara_test` database and never touch the demo data.
