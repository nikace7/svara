# M1 — Bilingual voice feasibility

Update 2026-09-25: Gemini-only is the demo configuration (ADR 011 amendment).
`@svara/providers` ships `GeminiAnswerGenerator`, `GeminiSpeechSynthesizer` and
`GeminiSpeechRecognizer` over plain REST `fetch` (no SDK). `pnpm eval:gemini` runs
the live gate: English and Nepali question → answer → 24 kHz speech → 16 kHz
round-trip transcript, writing `artifacts/gemini-smoke/{en-US,ne-NP}.wav` and
`report.json`. It requires `ALLOW_LIVE_EVAL=true` and `GEMINI_API_KEY`.

**The gate passed against a real key on 2026-09-25 for both locales** — see
"Live gate result" below. Recognition buffers each utterance and transcribes on
finish (no partial results); streaming recognition via the Live API is deferred
until hands-free barge-in.

## Live turns in the Voice lab — 2026-09-26

`/studio/voice-lab` now runs live turns when `PROVIDER_MODE=live`, still only on a
local host and behind a staff session. Typed question → grounded answer subtitles →
real 24 kHz speech playback. The page reports the mode it is actually running in;
it no longer claims to be fixture-only when it is not.

**Scope.** Typed or spoken questions. "Ask by voice" records up to 15 seconds of the
worklet's 16 kHz PCM16, releases the microphone, then sends the recording once as base64
on the same turn request (the route alone accepts 700 KB). The server replays it to
`GeminiSpeechRecognizer` as 100 ms frames before the stream opens, so failed recognition
is a readable 502, provider quota a 503 and silence a 422; nothing is persisted. The
separate microphone check still never uploads. Scripted scenarios remain fixture-only
and their control is disabled in live mode.
Answers are grounded in a release the operator picks in the lab (bot, then one of its
saved releases). Each question is searched against that release's frozen knowledge under
the caller's staff session; an unknown or foreign release is a 404 and an expired preview
a 410, both before the stream opens.

**Transport.** The existing NDJSON turn stream carries a new `audio` event type:
base64 PCM16 bounded to 4,800 bytes with its own `segment` and `end` fields. The
contract binds them together — a text event cannot smuggle audio, and an audio
packet cannot appear on a non-streaming turn. `providerMode` and `audio` are now
enums rather than fixture literals, and the fixture turn shape is unchanged.

**Playback backpressure.** `LabAudio.startAnswer` posts one packet at a time and
waits for the worklet's `accepted` reply. The playback queue is bounded to two
seconds, so a rejected packet is retried after 100 ms rather than dropped: the queue
draining at playback rate is the pacing signal. Completion is reported only when the
final segment finishes, so "Answer finished" cannot appear while audio is still
queued.

**Limits.** A live turn holds a provider quota slot, so the route allows two
concurrent turns instead of four and the request deadline rises to 120 s. Autoplay
policy can still refuse a context created after the click that started the turn; that
path reports "Answer audio could not play" and suggests pressing Test speaker first.
A browser run with a real key has not been recorded yet — see PROGRESS.md.

## Live gate result — 2026-09-25

Measured with a free-tier key, `gemini-3.6-flash` generation,
`gemini-3.8-flash-tts` speech (voice `Kore`) and `gemini-3.5-transcribe`
recognition. One run per locale, so these are single samples, not distributions.

| Locale | Answer grounded in passages   | Speech | Round-trip transcript           | First token | Answer   | Speech done | Transcript |
| ------ | ----------------------------- | ------ | ------------------------------- | ----------- | -------- | ----------- | ---------- |
| en-US  | yes (Room A-101, 10:00–16:00) | 7.4 s  | matches, digits spoken as words | 4,858 ms    | 5,219 ms | 11,825 ms   | 13,846 ms  |
| ne-NP  | yes (कोठा A-101, १०:००–१६:००) | 8.0 s  | matches in Devanagari           | 2,291 ms    | 2,581 ms | 8,899 ms    | 11,645 ms  |

Nepali synthesis and recognition both round-tripped correctly; `A-101` is spoken
and transcribed as `ए १०१`, which is correct pronunciation rather than an error.
Latency is far above a conversational target because each stage is a separate
buffered REST call; the Live API bidirectional session is the path to real-time.
Pronunciation quality still needs a human listener on the captured WAV files.

### Provider facts established by this run

- `gemini-2.5-flash` returns HTTP 404 for new keys with a migration notice; the
  defaults are now `gemini-3.8-flash`, `gemini-3.8-flash-tts` and
  `gemini-3.5-transcribe`.
- Free-tier quota is roughly **20 requests per day per model**
  (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), not per minute. Changing
  `GEMINI_MODEL` gives a separate budget. Popular models also return transient 503s,
  so `callGemini` retries 429/503 twice, honouring the server's own backoff hint.
- TTS returns a complete `audio/wav` container (24 kHz mono 16-bit), not the raw
  `audio/L16` the documentation shows; the synthesizer accepts either.
- `gemini-3.5-transcribe` returns text under `parts[].audioTranscription.text`
  rather than `parts[].text`.
- SSE frames are separated by CRLF blank lines, not `\n\n`.
- Gemini 3.x models think by default and consumed 383 of 400 output tokens on
  reasoning, truncating the answer; generation now sets
  `thinkingConfig.thinkingBudget = 0`.
- Passing the text to synthesize verbatim is correct. Prefixing an instruction
  ("Read this aloud exactly as written: …") corrupted the Nepali wording, so the
  synthesizer sends the text alone.
  Historical Azure/OpenAI references below describe the original M1 increment;
  see `docs/FREE-DEMO-SETUP.md` for the current provider direction.

Implemented the local increment on 2026-09-08 on `feat/m1-voice-feasibility`.
The live provider gate was pending at the time; it passed on 2026-09-25 (above). M1 stays
partial until real-key browser evidence, repeated sampling and hardware barge-in are recorded.

## Deliverable and boundaries

Build the reusable audio/protocol core and a local fixture lab at
`/studio/voice-lab`. Use the existing Svara components and quiet studio layout:
language and scenario controls, readable subtitles, measured stage timings, and
separate microphone/speaker checks.

No Azure Speech key/region or OpenAI key is configured; paid evaluation is disabled.
Live bilingual quality and hands-free speaker/microphone behavior remain pending.
No third-party speech recordings are supplied, so fixture answers are text-only.
A generated test tone exercises PCM playback and is explicitly not speech.

## Implementation order

1. Tested streaming resampling, PCM framing, generation ownership, bounded playback,
   Unicode sentence segmentation and ordered synthesis contracts.
2. Server fixture providers and an abortable, bounded local HTTP event stream.
3. AudioWorklet capture/playback, microphone cleanup and the bilingual lab UI.
4. Browser/security/failure checks, production rebuild and recorded evidence.

The temporary feasibility transport is HTTP NDJSON. Microphone data remains in the
browser in fixture mode. Authenticated Socket.IO session admission and live audio
transport belong to the subsequent identity/conversation work; this endpoint cannot
stand in for their authorization or durability contracts. It is guarded by explicit
local fixture settings, configured loopback Host and exact Origin, and absent in
production. M2 additionally requires a staff cookie and CSRF header and rechecks
session validity during the stream.

## Acceptance evidence

- 81 unit tests pass; selected foundation/audio/fixture modules have 97.77% line
  and 93.30% branch coverage. React/worklet/HTTP integration is checked separately.
- 11 integration tests pass in the built Linux container, including four-stream
  admission, 429/Retry-After and recovered capacity after client disconnection.
- 16 Playwright tests pass against the rebuilt Compose stack, covering both
  scripts, readable speech/quota failures, typed fallback and stale-output rejection.
- Chromium's synthetic microphone produces real 3,200-byte worklet batches with
  no HTTP upload. Language change, End and navigation release all observed tracks
  and AudioContexts. Unit tests cover delayed permission and unsupported APIs.
- A generated 440 Hz tone exercises the actual 24 kHz PCM playback worklet.
  Completion comes from the processor. This is not a bilingual audio recording.
- 44.1/48 kHz tests verify continuous filter/phase state across 128-frame input
  blocks and suppress a 12 kHz alias source before 16 kHz output. Little-endian
  PCM clipping, two-second queue bounds, sequence errors, ordered synthesis and
  grapheme-safe segmentation are tested deterministically.
- Build, typecheck, lint, contract drift and dependency audit pass. Production
  mode denies the lab. Desktop/mobile evidence is in ignored `artifacts/screenshots`.

## Known limits and next steps

The browser lab currently uses fixture mode only. Provider interfaces define the
future server boundary, but Azure/Gemini SDK adapters and real speech transport
are not connected. No account/region/voice compatibility or live latency has been
measured. Do not interpret positive fixture results as completion of the live gate.

No licensed speech clip is available. Fixture text and the test-tone algorithm are
original synthetic project content; no third-party audio was downloaded. Future
speech fixtures need explicit provenance and licence or an authorized generation run.

Automated browser tests use Chromium with a synthetic device. Real hardware echo,
hands-free barge-in, other browser engines and actual Nepali pronunciation still
need observation. Capture supports context rates from 16 to 192 kHz; playback
supports output contexts from 24 to 192 kHz. Tested common rates are 44.1/48 kHz.

The copied worklet assets refresh at web startup/build; restart native development
after editing worklet source. The lab persists no transcript or microphone data; kiosk and
visitor conversations are persisted separately under M6 and M7 retention. M2 replaced the
studio preview gate with staff sessions, and the lab keeps its local-only restriction.
Visitor sessions arrived in M6 through public links (see [M6](M6-CONVERSATIONS.md)).
Hosting beyond one machine is still unsupported (see [operations](OPERATIONS.md)).

## Primary references

- [Web Audio specification](https://www.w3.org/TR/webaudio-1.1/): worklet processing,
  actual context sample rate and render quanta.
- [Azure audio stream requirements](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-use-audio-input-streams): raw signed PCM16 mono input.
- The supplied blueprint, sections 7, 9, 14 and M1, governs Svara's protocol limits.
