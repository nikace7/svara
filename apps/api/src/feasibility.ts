import { once } from 'node:events';
import type { Request, Response } from 'express';
import { FeasibilityRequestSchema } from '@svara/contracts';
import type { FeasibilityEvent, FeasibilityRequest, ReleaseSearchResult } from '@svara/contracts';
import {
  IdentityError,
  RecognitionError,
  ReleaseError,
  runFixtureTurn,
  runLiveTurn,
  transcribe,
} from '@svara/domain';
import type { LiveTurnProviders } from '@svara/domain';
import type { SpeechRecognizer } from '@svara/providers';
import { allowsLocalFeasibility } from './local-access.js';

function fail(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({
    error: { code, message, fieldErrors: {}, retryable: status === 429 || status >= 500 },
    requestId: response.getHeader('x-request-id'),
  });
}

export interface LiveVoice {
  voice: Omit<LiveTurnProviders, 'passages'> & { recognizer: SpeechRecognizer };
  /** Searches one release under the requesting staff session, so tenancy stays enforced. */
  search: (
    request: Request,
    releaseId: string,
    query: { locale: 'en' | 'ne'; query: string },
  ) => Promise<ReleaseSearchResult>;
}

/** Only the expected failures before a stream opens get a response; anything else stays a
 * server error. Provider quota is 503, not 429: the studio reads 429 as its own rate limit. */
function preStreamFailure(error: unknown): [number, string, string] | undefined {
  if (error instanceof RecognitionError)
    return error.code === 'PROVIDER_QUOTA'
      ? [
          503,
          'PROVIDER_QUOTA',
          'The provider quota is exhausted. Retry later or type the question.',
        ]
      : [502, 'STT_UNAVAILABLE', 'Recognition is unavailable. Type the question instead.'];
  if (error instanceof ReleaseError && error.code === 'PREVIEW_EXPIRED')
    return [410, 'PREVIEW_EXPIRED', 'This preview has expired. Choose another release.'];
  if (error instanceof IdentityError && error.code === 'NOT_FOUND')
    return [404, 'NOT_FOUND', 'Choose a release from this workspace.'];
  if (error instanceof IdentityError && error.code === 'INVALID_INPUT')
    return [400, 'INVALID_INPUT', 'Ask a question with searchable text.'];
  return undefined;
}

async function ground(
  live: LiveVoice,
  request: Request,
  releaseId: string,
  locale: FeasibilityRequest['locale'],
  question: string,
): Promise<LiveTurnProviders['passages']> {
  const found = await live.search(request, releaseId, {
    locale: locale === 'ne-NP' ? 'ne' : 'en',
    // Search takes 500 characters; the model still receives the whole question.
    query: question.slice(0, 500),
  });
  return found.passages.map((passage) => ({
    id: passage.entryId,
    text: [passage.title, passage.question, passage.text].filter(Boolean).join('\n'),
  }));
}

/** Temporary local experiment; nothing is persisted. Live mode reaches real providers: a
 * recorded question goes to recognition once and is then discarded. Keys stay on the
 * server and never reach a response. */
export function createFeasibilityHandler(
  origin: string,
  authorize: (request: Request) => Promise<unknown>,
  live?: LiveVoice,
) {
  let active = 0;
  return async (request: Request, response: Response): Promise<void> => {
    if (!allowsLocalFeasibility(origin, request.headers.host, request.get('origin'))) {
      fail(response, 403, 'FORBIDDEN', 'Local same-origin access required.');
      return;
    }
    const parsed = FeasibilityRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(response, 400, 'INVALID_INPUT', 'Choose one bounded input and an explicit locale.');
      return;
    }
    const { scenario, text, audio, releaseId, locale } = parsed.data;
    if (!live && audio !== undefined) {
      fail(response, 400, 'INVALID_INPUT', 'Spoken questions need live providers.');
      return;
    }
    if (live && (scenario !== undefined || releaseId === undefined)) {
      fail(response, 400, 'INVALID_INPUT', 'Live mode answers questions from a release.');
      return;
    }
    const pcm = audio === undefined ? undefined : Buffer.from(audio, 'base64');
    if (pcm && (pcm.byteLength === 0 || pcm.byteLength % 2)) {
      fail(response, 400, 'INVALID_INPUT', 'Record the question as 16-bit mono audio.');
      return;
    }
    // Live turns hold a provider quota slot, so allow fewer of them at once.
    if (active >= (live ? 2 : 4)) {
      response.setHeader('Retry-After', '2');
      fail(response, 429, 'BUSY', 'The local lab is busy. Retry shortly.');
      return;
    }
    active++;
    const controller = new AbortController();
    const end = () => controller.abort();
    // Live turns make several buffered provider calls; fixtures stay on the short leash.
    const deadline = setTimeout(end, live ? 120000 : 10000);
    response.once('close', end);
    try {
      let turn: AsyncIterable<FeasibilityEvent>;
      if (live) {
        const question = pcm
          ? await transcribe(live.voice.recognizer, pcm, locale, controller.signal)
          : (text ?? '');
        if (!question) {
          fail(response, 422, 'NO_SPEECH', 'No speech was heard. Try again, or type the question.');
          return;
        }
        const passages = await ground(live, request, releaseId!, locale, question);
        turn = runLiveTurn(
          { ...parsed.data, audio: undefined, text: question },
          { ...live.voice, passages },
          controller.signal,
        );
      } else turn = runFixtureTurn(parsed.data, controller.signal);
      response.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      for await (const event of turn) {
        await authorize(request);
        if (!response.write(`${JSON.stringify(event)}\n`))
          await once(response, 'drain', { signal: controller.signal });
      }
    } catch (error) {
      if (response.headersSent) {
        // A truncated stream is a failure at the client, never a completed answer.
        if (!controller.signal.aborted) response.destroy();
        return;
      }
      if (controller.signal.aborted) {
        if (!response.destroyed) fail(response, 504, 'TIMEOUT', 'The question took too long.');
        return;
      }
      const failure = preStreamFailure(error);
      if (!failure) throw error;
      fail(response, ...failure);
    } finally {
      clearTimeout(deadline);
      response.off('close', end);
      controller.abort();
      active--;
      if (response.headersSent && !response.writableEnded) response.end();
    }
  };
}
