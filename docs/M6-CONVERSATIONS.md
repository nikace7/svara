# M6 — Conversations and the public assistant

Three kinds of actor talk to a pinned release:

- **Staff** use the playground.
- **Paired kiosks** talk as the device.
- **Visitors** come in through a public link.

Every question and answer is persisted as it happens. Every tool call is validated on the
server before it has any effect. See ADR 027 for where this departs from the blueprint and
why.

## Who may talk, and to what

| Actor   | Credential                                   | Route family                                     | Release                                                |
| ------- | -------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| Staff   | Staff cookie and CSRF; `operate_devices`     | `/api/v1/voice-sessions`                         | Chosen by staff: any release, including a live preview |
| Kiosk   | Device cookie and runtime CSRF               | `/api/v1/runtime/voice-sessions`                 | Its desired release, once fully applied                |
| Visitor | Link-bound HttpOnly grant and its CSRF token | `/api/v1/public/assistants/:slug/voice-sessions` | The link's pinned published release                    |

The server derives organisation, release and device from the credential. A kiosk whose
release is still downloading, idle or in maintenance gets `409 NOT_READY`.

A visitor grant lasts 30 minutes. It is valid only for its own link, and is capped at 20
sessions and 60 questions. Each IP may open 10 grants a minute.

Each actor has one open session: a new admission ends the previous one. A partial unique
index enforces this in PostgreSQL.

## Admission and limits

Admission locks the organisation's `DailyUsage` row for the UTC day, so concurrent
requests serialize. It then checks:

- **Concurrency:** 10 active sessions per organisation.
- **Live daily limits:** 100 sessions and 3,600 reserved seconds per organisation.

A live session reserves its whole five-minute allowance. An ordinary close returns the
unused part. A session that expired or was abandoned (after a crash, for example) keeps
the whole reservation, because nothing verified when it actually stopped.

A session is active until its idle deadline (60 s after the last answer) or its absolute
deadline (5 min), whichever comes first. The worker ends stale sessions with each
reconciliation tick: at startup and every five seconds.

Sessions also end:

- when a kiosk's desired release changes (`RELEASE_CHANGED`);
- when the device is revoked, disabled or re-paired (`DEVICE_REVOKED`);
- when its link is disabled or expires (`LINK_DISABLED`);
- on the next request after either deadline has passed.

## A turn

`POST …/:id/turns` carries a `generation` that must exceed the session's current one, a
`clientMessageId` that is unique within the session, the locale, and one input:

- text of up to 2,000 characters;
- a recorded question of up to 15 s of 16 kHz PCM16, live mode only;
- `retryOf`, the ID of an unfinished turn to answer again.

The response is NDJSON (protocol v1): `transcript`, then `answer` sentences with `audio`
packets, plus `reference` and `tool` events, ending in `complete` or `error`.
`TTS_UNAVAILABLE` is not terminal: the text carries on without speech.

The turn runs in this order:

1. **Transcribe.** A spoken question is transcribed once, then discarded.
2. **Retrieve.** Only the pinned release's approved passages are searched. They are
   labelled `[1]`…`[5]`; slides are labelled `S1`….
3. **Fallback.** If no passage matches and no slide can be shown, the approved fallback is
   given without calling the model.
4. **First round.** The model may propose up to four tool calls. They run only after the
   round finishes streaming.
5. **Second round.** A tool-free round answers from the real outcomes.
6. **Citations.** Every citation must be a label that was supplied. An unsupplied label
   triggers one regeneration, and only before any tool ran; after that the fallback is
   used.

Before every sentence, tool outcome and completion, the stream re-checks the session in
the database. An interrupt, a newer turn (even in another API process), a disabled link or
an ended session therefore stops it with `SESSION_ENDED`.

The turn row is finished on every path. An interrupted answer keeps the text generated
before the stop, marked `INTERRUPTED`.

## Tools

| Tool                 | Who                        | Server behaviour                                                                                                                                                                                  |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lookup_knowledge`   | All                        | Search the pinned release again; the results become new passages.                                                                                                                                 |
| `select_reference`   | All                        | Show one supplied passage as a reference; the entry must be in the release.                                                                                                                       |
| `get_event_schedule` | Kiosk                      | The current deployment's event and hours.                                                                                                                                                         |
| `show_slide`         | Kiosk, with a presentation | Persists a 10-second `slide.show` command for the kiosk's applied release; the primary acknowledges it. Waits three seconds, then reports `PENDING`, never `APPLIED`, without an acknowledgement. |

A call is recorded as `REJECTED`, with no effect, when:

- the tool is not in the release allowlist or the actor may not use it;
- its generation is stale;
- its slide or entry is not in the release;
- the slide is for a different screen;
- the turn has already made four calls.

A repeated call ID returns the original outcome. A retried answer is told what already
happened and is not offered `show_slide` again. The dispatcher enforces this, so it does
not depend on the prompt.

Slide commands never move the applied release revision, and the outbox never retries them.

## Screens

- **`/assistant/:slug`**: greeting, question suggestions (the release's approved FAQ
  questions), slides, and the conversation. An unknown, disabled or expired link shows
  the same "not available" page.
- **Kiosk:** the conversation sits beside the greeting and slides. Its controls hide while
  the kiosk is offline, updating or in maintenance, and each new release starts a fresh
  conversation. A slide command pins that slide on its target screens for a minute.
- **Studio:**
  - Playground: a release picker plus a "what happened" inspector.
  - Sessions: history and a per-session record with states, tool and kiosk outcomes, and
    measured timings; owners and administrators can delete the transcript.
  - Public links: a section in Settings.

The conversation panel owns the session, generation, microphone and speech output:

- **Stop speaking** flushes playback immediately and tells the server.
- **Changing language** stops the current answer.
- **End** clears the transcript.
- **A dropped connection** offers **Reconnect**, which restores finished turns from the same
  actor's session.
- **Microphone refusal and speech failure** leave text working.

## Demo mode

Without a live key, conversations run in explicit demo mode. `FixtureAnswerGenerator`
quotes the top approved passage verbatim under a "Demo mode" prefix. It proposes
`show_slide` only when a slide title matches the question, and never composes facts.
Demo mode is text-only, and voice input is unavailable. Sessions record their provider
mode.

## Evidence

- **Unit tests:** turn runner (citations, regeneration, tool rounds, PENDING without an
  acknowledgement, speech failure, quota, interruption); Gemini tool declarations and
  echoed call parts; demo answers; contract rules; the web stream reader.
- **Integration tests** (`conversations.test.ts`, `conversations-http.test.ts`):
  - admission scope and one session per actor;
  - concurrent live daily limits and settlement;
  - stale generations and duplicate messages;
  - tool validation, including late calls after an interrupt;
  - sessions ending on a release change or revocation;
  - links that expose no knowledge and close their sessions when disabled;
  - resume only for the same actor;
  - transcript deletion by role;
  - a real socket acknowledging a slide over HTTP.
- **Browser** (`conversations.spec.ts`), with axe scans:
  - a visitor in English and Nepali until the link is turned off;
  - a kiosk slide mirrored on its display;
  - an interrupted long answer;
  - the session record;
  - the playground inspector.

## Not built, or not yet proven

- **Live tool calling** has only been exercised against recorded Gemini request and
  response shapes. It has not been run with a real key; free-tier quota was held back. The
  first real-key run should confirm the function-call format and thought-signature echo.
- **Streaming voice transport.** There is no `/voice` Socket.IO namespace and no
  hands-free barge-in; see ADR 027.
- **Subtitles on the display.** `subtitle.updated` is not sent, so the display mirrors
  slides but not subtitles.
- **Idempotency keys on admission.** A retried admission creates a new session, which
  replaces the old one.
- **A paired simulator in the playground.** Slide tools are tested on a real paired kiosk
  (or the device simulator) instead.
- **Nepali visitor copy** is a draft and needs native-speaker review.
- **Operations sockets, transcript retention and analytics** belong to M7.
