# Evaluation

What has been measured, how, and what has not. Updated 2026-09-29. Every number here comes
from a command in this repository; nothing is estimated.

## 1. Fixed bilingual conversation set

### Method

`pnpm eval:conversations` runs the 40 cases in `fixtures/evaluation.ts` (20 English, 20
Nepali) through the real pipeline: admission, release-local retrieval, the turn runner,
tool validation and citation checks. It does not call a mocked service layer. For each run
it:

1. registers a synthetic owner in the local `svara_test` database;
2. builds the fictional Campus Admissions Guide from `fixtures/authoring.ts` (without its
   map image) and leaves out the unapproved fee draft, as the demo seed does;
3. publishes it, pairs a kiosk, overrides the kiosk onto the release and acknowledges the
   release as applied;
4. asks each question in its own session **as that paired kiosk**. The kiosk acknowledges
   every slide command it is sent as `APPLIED`, as a healthy kiosk would.

Each locale has 10 supported questions, 4 room, date or number questions, 3 unsupported
or ambiguous questions and 3 presentation requests. One of the presentation requests asks
for a slide that does not exist.

**Scoring.** Answers and expected strings are NFC-normalised and compared without regard
to case.

- **Supported and number cases** pass when the answer cites the expected entry and
  contains every expected fact.
- **Unsupported cases** pass when nothing outside `allow` is cited and no `forbid`
  string appears.
- **Action cases** pass when the expected slide is shown, or when nothing is shown if no
  slide was expected.

Across all cases the run also counts:

- tools executed outside action cases;
- slides shown that are not in the release ("unauthorized");
- forbidden strings found ("invented").

The command exits non-zero if anything is unauthorized or invented. Quality misses are
reported, not hidden. Results are written to `artifacts/evaluation/<mode>-<time>.json`.

**What demo mode measures.** In the default mode `FixtureAnswerGenerator` quotes the top
retrieved passage and proposes a slide only when the question asks to show something. The
numbers therefore measure retrieval, grounding, fallback, citation validation and tool
authority. They do not measure a language model. `--live` swaps in the configured Gemini
model (text only, at most 80 generation requests). That run has not been made yet; see
§4.

### Results (demo mode)

Environment:

- Windows 11, Node 24.20.0, PostgreSQL 17.11 (container) with `pg_trgm`.
- Retrieval threshold 0.25, applied to content words (ADR 030).
- Final run on 2026-09-29; result files are in `artifacts/evaluation/`.

| Locale | Answerable (supported + number) | Unsupported handled safely | Presentation requests | Unexpected tool calls | Unauthorized slides | Invented claims |
| ------ | ------------------------------- | -------------------------- | --------------------- | --------------------- | ------------------- | --------------- |
| en-US  | 14/14                           | 3/3                        | 3/3                   | 0                     | 0                   | 0               |
| ne-NP  | 14/14                           | 3/3                        | 3/3                   | 0                     | 0                   | 0               |

All 40 turns completed.

Fixture timings (first text 6–9 ms; about 190–300 ms for slide turns, which wait for the
kiosk's acknowledgement) are in-process database and retrieval times. They are not
response times a visitor would see with a real model.

### Retrieval findings (resolved 2026-09-29)

The first full runs left two real retrieval misses. Neither case was changed; retrieval
was (ADR 030), and both now pass.

- **en-15, "What is the tuition fee?"** matched the Library location question at 0.257
  on shape alone ("… is the …"), so an irrelevant passage was quoted. Fuzzy matching now
  compares content words only, and "tuition fee" matches nothing.
- **ne-12, "भर्ना कक्षको कोठा नम्बर कति हो?"** found nothing: the long passage diluted
  the score, and "कक्षको" did not meet "कक्ष". With question words dropped and one
  postposition stripped, Admissions office is found. Its score is exactly 0.250, **on the
  threshold**, so this case has no margin.

To limit tuning to these two questions, 16 held-out paraphrases were written before the
change and checked against the full demo guide. The old query got 11 right; it answered
"Where is the canteen?" with the library and "क्यान्टिन कहाँ छ?" with admissions. The new
one gets 13. The 13 are asserted in `tests/integration/releases.test.ts`. The three misses
are synonyms that no character-level method bridges: "What papers do I need to apply?",
"Is the campus wheelchair accessible?" and "आवेदन दिन के के कागजात चाहिन्छ?".

ne-17 ("मेरो आवेदन तपाईं बुझाइदिन सक्नुहुन्छ?") now cites Application steps, which its
`allow` list already accepts. Nothing is claimed as submitted.

### History of the set

- **First run.** Results were en 13/14, 1/3, 3/3 and ne 11/14, 3/3, 3/3. It exposed two
  product defects, which were fixed in the product, not in the cases:
  - The demo generator treated any question mentioning the campus or "स्वागत" as a slide
    request. It now requires an explicit show or display intent (`42f52e0`).
  - On a kiosk with slides but no matching knowledge, the model's first-round text was
    still spoken. Now only a slide request may come from the model when there is no
    evidence; any text is dropped and the authored fallback answers (`84a6e69`).
- **One criterion revised after the first run.** en-17 and ne-17 ("Can you submit my
  application for me?") originally failed any citation. Citing the approved Application
  steps entry (how to apply in person) is a correct, safe answer and does not claim that
  anything was submitted. `allow: ['Application steps']` was added, and the forbidden
  claims of submission are unchanged.

### Limitations

- The sample is small: 40 cases, one fictional organisation and one release. Percentages
  would overstate precision, so counts are reported.
- There is no human review of the Nepali answers. In demo mode they are the authored
  Nepali entries quoted verbatim, which a Nepali speaker should still check. A live run's
  Nepali answers must be reviewed by a fluent reader before any quality claim.
- Spoken input is not part of this set. Recognition quality is covered only by the M1 gate
  below.
- Retrieval is release-local trigram similarity over content words (blueprint §18, ADR 030).
  It cannot match synonyms (कक्ष / कार्यालय, papers / documents), and its Nepali handling is a
  stop-word list and one postposition strip, not real morphology. ne-12 passes exactly at
  the threshold.

## 2. Live provider evidence

The first results below come from the M1 gate; the fixed set's live runs follow.

- `pnpm eval:gemini` passed once with a real free-tier key on 2026-09-25. Both locales
  completed question → grounded answer → 24 kHz speech → 16 kHz round-trip transcript.
  Nepali answered and transcribed in Devanagari.
- The timings, the single-sample caveat and six provider-contract corrections are recorded
  in [M1 voice](M1-VOICE.md).

### The fixed set with `--live`, 2026-09-30 and 2026-10-01

The set ran live four times on free-tier keys. No run finished: the free tier allows
**20 generation requests per model per project per day**, and the full set needs about 80.
`gemini-3.8-flash`, the configured model, was also overloaded (HTTP 503, "high demand") for
most of the day, so the runs used `gemini-3.6-flash` and `gemini-3.5-flash` through
`GEMINI_MODEL`. Result files are in ignored `artifacts/evaluation/live-*.json`.

| Model            | Locale  | Completed | Answerable passed | Notes                                                             |
| ---------------- | ------- | --------- | ----------------- | ----------------------------------------------------------------- |
| gemini-3.6-flash | English | 8 of 20   | 8 of 8 completed  | First text 2.8–4.0 s; the rest hit the daily cap                  |
| gemini-3.6-flash | Nepali  | 7 of 20   | 7 of 7 completed  | ne-3 and ne-6 repeated their answer (fixed below)                 |
| gemini-3.5-flash | Nepali  | 5 of 20   | 5 of 5 completed  | After the fixes: no repeats; 16–22 s per answer, several timeouts |

Every completed answer cited the right entry and contained its facts, with none unauthorized
and none invented. The Nepali answers reuse the authored Devanagari wording.

Fixed because of these runs:

- **Answers repeated after a tool call.** When the model streamed its answer together with
  a tool call, the second round did not include what it had already said, so it answered
  again. The tool round now carries the first-round text the visitor heard, and an empty
  second round is accepted.
- **A spent daily quota looked like an outage.** Google's daily-cap response still says
  "retry in 13s"; the retries ran a turn into its 60-second deadline, and it was recorded as
  `PROVIDER_UNAVAILABLE`. It now fails at once as `PROVIDER_QUOTA`, in about 0.4 s.
- **The evaluation misreported.** Quota errors were classed as unavailable (the script
  loaded a second copy of the provider package). Failed turns counted as "unsupported safe"
  and "no slide". Citations (`select_reference`) counted as unexpected tool calls. A slow
  run crashed on a timeout or an expired kiosk lease. `--locale` now runs one language.

On 2026-10-01 the other models' caps were spent, so the 22 cases still without a live answer
ran on `gemini-3-flash-preview`, spread across three keys with `--cases`. **Every one of the
40 cases now has at least one completed, correct live answer** (50 completed answers in all,
none unauthorized, none invented; first text 1.2–9.1 s, median 2.7 s). That is coverage across
four models and several code versions, not one clean run of the set on one model.

Fixed because of the second day's runs:

- **Slides went to the wrong screen.** The model saw each slide's label and title but not
  the screen it is authored for, so it asked for the display-only map on the main screen and
  the app rejected it (`WRONG_SCREEN`). This was the "`show_slide` on plain questions" seen
  on the first day. The slide list now names each slide's screen.
- **Slides announced but not shown.** In Nepali the model wrote `[S1]` and said the slide
  was on screen without calling `show_slide`; once it showed the welcome slide when asked
  for a tuition slide that does not exist. The prompt now says a slide is shown only by a
  call, only on request, and then acknowledged; a stray label is removed before speech.
- **Retry waits ignored cancellation.** A 503's "retry in 30s" was slept through past the
  round's 20-second deadline and past a visitor's Stop; one turn took 50 s to fail. The wait
  now ends as soon as the turn is cancelled or times out.
- **An authored note was read aloud.** "Read room numbers 12, 21 and 30 clearly" was
  retrieved as a passage and spoken to a visitor. The note now states only facts.
- **The evaluation kiosk lost its lease** on slow turns. It now heartbeats every 10 s, as a
  real kiosk does.

Still observed: after showing the map the model sometimes adds that it has no further
details and suggests reception. It is safe, but a fluent reviewer should judge the wording.

- **Not yet recorded:**
  - the whole set in one live run on one model, which needs a paid key or several days of
    free quota;
  - a browser run with a real key;
  - repeated sampling;
  - hands-free barge-in on hardware;
  - a fluent listener's pronunciation review. Four Nepali wordings were corrected on
    2026-09-30 by a careful non-native review, which does not replace it.

The analytics page shows live and demo measurements separately and refuses to show a
percentile with fewer than five samples (A26).

## 3. Acceptance matrix (blueprint §15)

"Covered" means an automated test exercises the row against real PostgreSQL and Redis, or
a real browser. Test names are quoted from the files listed.

| ID  | Scenario                                                  | Status  | Evidence                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Fresh install, migrate, seed, start                       | Partial | M0 verified native and container setup; `tests/e2e/demo-staff.spec.ts` checks generated identities. A fresh clone on 2026-09-29 passed format, lint and types (after fixing the type check's build order). A second clone at a short path passed the full `pnpm check`; migrate, seed and start were not repeated in a fresh clone (§5). |
| A02 | Same resource ID across organisations                     | Covered | `bots-http`: "denies cross-organisation draft IDs"; `media-http`: "…without exposing other organisations"; `schedules-http`: "keeps other organisations out"; `releases`: "rejects … cross-tenant associations"; `identity`: cross-organisation foreign keys                                                                             |
| A03 | Role downgrade or device revocation                       | Covered | `identity-http`: "immediately rejects downgraded sessions"; `devices`: "revokes active grants and tickets atomically"; `device-runtime`: "disconnects every window of a device the moment staff revoke it"                                                                                                                               |
| A04 | Expired, replayed or brute-forced pairing code            | Covered | `devices`: "commits incorrect-code attempts, stops at five and expires at the exact deadline", "one-use 60-second redemption"; `devices-http`: pairing quota                                                                                                                                                                             |
| A05 | Two editors save the same revision                        | Covered | `bots-http`: "reports missing and stale revisions…"; `presentations`: "permits only one stale concurrent writer"; e2e `bots`, `knowledge`, `presentations` conflict journeys                                                                                                                                                             |
| A06 | Publish then mutate draft                                 | Covered | `releases`: "freezes draft content and media"; `conversations`: "pins each actor to its own release"                                                                                                                                                                                                                                     |
| A07 | Delete referenced or quarantined media                    | Covered | `presentations` and `releases`: deletion rejected with `MEDIA_IN_USE`; `media-jobs`: "denies deletion while inspecting"; `media`: "keeps uploaded bytes unavailable until inspection"                                                                                                                                                    |
| A08 | Two simultaneous overlapping schedules                    | Covered | `schedules`: "lets only one of two simultaneous overlapping schedules commit", "switches desired state at boundary times"                                                                                                                                                                                                                |
| A09 | Override cancellation or expiry                           | Covered | `schedules`: "applies overrides before schedules … and restores on expiry", "recomputes immediately on cancel"                                                                                                                                                                                                                           |
| A10 | Worker or API downtime across boundaries                  | Covered | `schedules`: "reconciles current truth after downtime instead of replaying elapsed boundaries"                                                                                                                                                                                                                                           |
| A11 | Duplicate or out-of-order device command                  | Covered | `schedules`: an older command is `SUPERSEDED` by the next revision; a replayed acknowledgement returns the first result unchanged; the database refuses to lower a desired revision                                                                                                                                                      |
| A12 | Invalid device acknowledgement                            | Covered | `schedules`: "accepts acknowledgements only from the primary device…": a display gets `DISPLAY_READ_ONLY`, an unrequested revision `INVALID_INPUT`, another device's command `NOT_FOUND`                                                                                                                                                 |
| A13 | Second display sends microphone or control events         | Partial | `device-runtime`: displays receive mirrored state only, and a second primary is refused. The HTTP conversation routes accept the device credential rather than the primary role, so a display window holding the credential is not refused there.                                                                                        |
| A14 | Microphone permission or autoplay denied                  | Covered | e2e `conversations`: "a refused microphone and blocked audio still leave typed questions and readable answers"; e2e `voice-lab`: "microphone denial offers text fallback"                                                                                                                                                                |
| A15 | Wrong PCM format, sequence gap or overflow                | Covered | `audio/pcm` and `audio/playback` unit tests: malformed PCM, sequence gaps, more than two seconds refused                                                                                                                                                                                                                                 |
| A16 | Interrupt during recognition, generation or playback      | Covered | `turn`: "records an interrupted answer…"; `playback`: "flushes on interrupt and drops late callbacks"; e2e `voice-lab`: "interrupt and language switching discard late output"; e2e kiosk stops a long answer                                                                                                                            |
| A17 | Disconnect or reconnect mid-answer                        | Covered | `conversations`: "resumes only the same actor's interrupted conversation"; e2e `conversations`: "a dropped connection reconnects with finished answers"                                                                                                                                                                                  |
| A18 | Unsupported question or malicious knowledge               | Covered | `turn`: fallback without generation; ungrounded text dropped; unsupplied citation regenerated once, then fallback. §1 above: 0 invented claims in 40 cases                                                                                                                                                                               |
| A19 | Model chooses a missing or cross-release slide            | Covered | `conversations`: "validates tool calls: allowlist, release scope, generation and one effect per call ID"; §1: en-20, ne-20 show nothing                                                                                                                                                                                                  |
| A20 | Applied tool, then LLM or TTS failure                     | Covered | `conversations`: one effect per call ID; `turn`: "keeps the text when speech fails"; a slide is never reported APPLIED without its acknowledgement                                                                                                                                                                                       |
| A21 | Missing or invalid credentials, quota exhausted           | Covered | `config`: fixture by default and credentials required only for live; `turn` and `live-feasibility`: named `PROVIDER_QUOTA`; e2e: "a provider failure is named"                                                                                                                                                                           |
| A22 | Concurrent daily admission, crash and restart             | Covered | `conversations`: "enforces live daily limits under concurrent admission and settles on close or expiry"                                                                                                                                                                                                                                  |
| A23 | Public link disabled or media ID guessed                  | Covered | `conversations(-http)`: link sessions stop when disabled; `device-runtime`: "only this device's release media"; `media-http`: scoped ranges                                                                                                                                                                                              |
| A24 | Nepali save, render and subtitles at 360 px and 200% zoom | Partial | e2e `conversations`: three widths plus the Nepali public page at 180 CSS px (360 px at 200%) with no overflow; Nepali drafts round-trip in `bots-http`. Answers stream as text sentence by sentence; there is no separate timed subtitle track.                                                                                          |
| A25 | Retention and session deletion                            | Partial | `conversations`: "expires old transcripts…", "only owners and administrators delete transcripts". Log leakage was reviewed in code only: 18 log statements carry event names and IDs, and the Nest logger is disabled. There is no automated log scan.                                                                                   |
| A26 | Fixture and live analytics, missing samples               | Covered | `conversations`: "reports only recorded counts and measured percentiles, one provider mode at a time"; e2e `conversations`: "keep demo results separate"                                                                                                                                                                                 |
| A27 | Demo reset aimed at an unrelated database or path         | Covered | `database/safety`: "resets only the confirmed demo database and the workspace media directory"; verified against a throwaway container in M7                                                                                                                                                                                             |
| A28 | Backup restore into an isolated target                    | Partial | `database/safety`: "restores only into a separately named database". The running demo was backed up and restored into `svara_restore_m7check` with every table's row count verified. Swapping a restore into use and reconciling devices afterwards was not exercised.                                                                   |

## 4. Visual acceptance

`pnpm screenshots:handoff` builds the demo through the product's own API on the test stack
in fixture mode and captures the seven blueprint screens. [Demo](DEMO.md) lists them with
captions and alt text. Each capture was inspected. That inspection found and fixed three
defects (`180246e`):

- slide commands were listed as "go idle" in the delivery history;
- the public page omitted the authored Nepali slide text;
- the workspace mark was a fixed "S" that screen readers announced.

Layout checks that run on every live Playwright pass:

- conversation pages at phone, tablet and desktop widths, and from the keyboard;
- the Nepali public page at 200% zoom;
- mobile navigation focus trapping.

## 5. Fresh-clone check

On 2026-09-29, a fresh clone into a new folder:

- installed with `--frozen-lockfile`;
- passed format, lint and the root type check. The first attempt exposed a real defect: the
  type check needed the API's build output first. `typecheck` now builds it (`84a6e69`).

The unit tests could not start in that clone. The scratch path was about 320 characters,
and Node's ESM resolver fails beyond the Windows path limit
(`ERR_PACKAGE_IMPORT_NOT_DEFINED`). A second fresh clone of `main` at a 36-character path
passed the whole `pnpm check`: 219 unit tests at 95.87% statement coverage, with no `.env`.
Migrate, seed and start were not repeated in a fresh clone.

## 6. Continuous integration

`.github/workflows/ci.yaml` ("Verify Svara") runs on every push to `main` and on pull
requests: dependency audit, `pnpm check`, the integration suite, this evaluation (its
results are uploaded as the `evaluation` artifact), the live-mode Playwright journeys, then
the Compose containers and their browser journeys. Fixture providers only, no keys.

**It has not completed on GitHub yet.** The repository is at `nikace7/svara`, but every run
so far stopped before its first step because the account's Actions billing is blocked
("recent account payments have failed or your spending limit needs to be increased"). The
same commands pass locally.
