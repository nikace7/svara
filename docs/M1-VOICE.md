# M1 — Bilingual voice feasibility

Update 2026-09-08: the user's free-demo requirement selects Gemini generation with
Azure Speech F0 as the planned demo configuration. Live adapters remain pending.
Historical Azure/OpenAI references below describe the original M1 increment;
see `docs/FREE-DEMO-SETUP.md` and ADR 011 for the current provider direction.

Implemented the local increment on 2026-09-08 on `feat/m1-voice-feasibility`.
The live provider gate remains pending; M1 is not marked complete.

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
local fixture settings, loopback Host and exact Origin, and absent in production.

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
future server boundary, but Azure/OpenAI SDK adapters and real speech transport
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
after editing worklet source. No transcript or microphone data is persisted. M2
must replace the local preview gate before staff or visitor use is hosted.

## Primary references

- [Web Audio specification](https://www.w3.org/TR/webaudio-1.1/): worklet processing,
  actual context sample rate and render quanta.
- [Azure audio stream requirements](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-use-audio-input-streams): raw signed PCM16 mono input.
- The supplied blueprint, sections 7, 9, 14 and M1, governs Svara's protocol limits.
