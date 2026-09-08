# M1 — Bilingual voice feasibility

Started 2026-09-08 on `feat/m1-voice-feasibility`.

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

Pending implementation. Tests will cover 44.1/48 kHz conversion, chunk boundaries,
anti-alias filtering, PCM byte order, sequence gaps, queue bounds, interruption,
late callbacks, both scripts, provider failures and browser resource disposal.

## Primary references

- [Web Audio specification](https://www.w3.org/TR/webaudio-1.1/): worklet processing,
  actual context sample rate and render quanta.
- [Azure audio stream requirements](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-use-audio-input-streams): raw signed PCM16 mono input.
- The supplied blueprint, sections 7, 9, 14 and M1, governs Svara's protocol limits.
