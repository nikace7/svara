# Free demo provider setup

Checked 2026-09-21. The local fixture demo works now, without accounts or keys. Live
SDK adapters and the English/Nepali smoke gate are still pending; adding keys does
not make the current lab perform recognition or synthesis.

## Demo pipeline

Default: **Gemini only** (`SPEECH_PROVIDER=gemini`, `GENERATION_PROVIDER=gemini`).
One Google AI Studio key covers recognition, generation and synthesis. The
[Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing) lists free-tier
input and output for `gemini-2.5-flash`, the Flash TTS preview models and the Live
native-audio models. Nepali (`ne`) is listed for both
[TTS](https://ai.google.dev/gemini-api/docs/speech-generation) and the
[Live API](https://ai.google.dev/gemini-api/docs/live-guide). Live audio is 16 kHz
PCM in and 24 kHz PCM out, matching the existing worklets. Free-tier rate limits
are shown only in [AI Studio](https://aistudio.google.com/rate-limit).

Free-tier content may be used to improve Google's products, so use Svara's fictional
campus data for the demo. Confirm the project's **Free** tier before calling the
API; the app cannot infer billing status from a key.

Alternative: **Azure Speech F0 → Gemini → Azure Speech F0** (`SPEECH_PROVIDER=azure`).
Azure lists 5 hours of real-time speech recognition and 500,000 neural speech
characters per month for **F0**, with named `ne-NP` voices. Select the F0 resource
tier explicitly; an Azure account or a key alone does not prove a resource is free.
[Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/).
Keep this as the fallback if the live gate finds Gemini's Nepali speech inadequate.

OpenAI remains an explicitly selected generation alternative; an OpenAI key is not
required by the default configuration.

## 1. Create a Gemini key

1. Sign in to [Google AI Studio](https://aistudio.google.com/).
2. Open its dashboard and create/select a project for this demo. Confirm it is
   on the Free tier and leave billing upgrades disabled.
3. Open **API Keys** and create a new key for that project. Use a newly issued
   restricted/auth key as described in the current documentation.
4. Save it only as `GEMINI_API_KEY` in Svara's ignored local `.env` file.

See [Google's key setup guide](https://ai.google.dev/gemini-api/docs/api-key) if the
dashboard requires project import or additional account permissions. Keys belong
to your account; no shared/public key is needed.

## 2. Create Azure Speech F0 (only if `SPEECH_PROVIDER=azure`)

1. Sign in to the [Azure portal](https://portal.azure.com/) with your own account
   and complete the subscription onboarding if required.
2. Search for **Speech**, create a Speech resource, choose a resource group and
   region, and explicitly select **F0 (Free)**. If F0 is unavailable, leave this
   step pending rather than selecting a paid tier.
3. After creation, open the resource's **Keys and Endpoint** page. Copy one key
   and its region identifier into `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
4. Confirm the resource still shows F0. Use the region attached to that resource;
   do not guess it from the nearest city.

Microsoft's [Speech resource exercise](https://microsoftlearning.github.io/mslearn-ai-language/Instructions/Exercises/07-speech.html?azure-portal=true)
describes the portal flow, and the [Speech quickstart](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-text-to-speech)
explains key/region configuration. Svara needs standard recognition and the named
English/Nepali voices; it does not need custom voice training or endpoint hosting.

## 3. Store settings locally

Run `pnpm setup:local` if the project has not been set up. Edit the existing `.env`
in the repository root and add these entries, keeping its generated database and
token secrets intact:

```dotenv
SPEECH_PROVIDER=gemini
GENERATION_PROVIDER=gemini
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=YOUR_NEW_GEMINI_KEY
PROVIDER_MODE=fixture
ALLOW_LIVE_EVAL=false
```

`AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` may stay empty; live mode requires
them only when `SPEECH_PROVIDER=azure`. Replace placeholders locally. Keep `PROVIDER_MODE=fixture` and
`ALLOW_LIVE_EVAL=false` while the provider adapters and authenticated admission are
being completed. The current Compose demo intentionally stays in fixture mode and
does not receive these provider keys. A later verified live launch path will pass
them to the API only.

Do not add keys to `NEXT_PUBLIC_*`, Git, screenshots or chat. `.env.example` is a
reference file containing no working credentials. `pnpm setup:local` preserves
existing settings rather than replacing them.

## 4. Live validation still required

Once accounts and adapters are ready, the live gate must verify both locales,
actual voice availability, quota failures, cancellation, generation grounding and
speaker/microphone behaviour. Provider quota errors must stop a request visibly;
there will be no automatic switch to a paid provider. Account quotas and region
availability are external conditions, not proof supplied by passing fixture tests.
