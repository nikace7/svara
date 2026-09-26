import { once } from 'node:events';
import type { Request, Response } from 'express';
import { FeasibilityRequestSchema } from '@svara/contracts';
import type { FeasibilityEvent } from '@svara/contracts';
import { runFixtureTurn, runLiveTurn } from '@svara/domain';
import type { LiveTurnProviders } from '@svara/domain';
import { allowsLocalFeasibility } from './local-access.js';

function fail(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({
    error: { code, message, fieldErrors: {}, retryable: status === 429 || status >= 500 },
    requestId: response.getHeader('x-request-id'),
  });
}

/** Temporary local experiment; no persistence or microphone upload.
 * Live mode reaches real providers; keys stay on the server and never reach a response. */
export function createFeasibilityHandler(
  origin: string,
  authorize: (request: Request) => Promise<unknown>,
  live?: LiveTurnProviders,
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
    if (live && parsed.data.text === undefined) {
      fail(response, 400, 'INVALID_INPUT', 'Live mode answers typed questions only.');
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
    response.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    try {
      const turn: AsyncIterable<FeasibilityEvent> = live
        ? runLiveTurn(parsed.data, live, controller.signal)
        : runFixtureTurn(parsed.data, controller.signal);
      for await (const event of turn) {
        await authorize(request);
        if (!response.write(`${JSON.stringify(event)}\n`))
          await once(response, 'drain', { signal: controller.signal });
      }
    } catch {
      // A truncated stream is a failure at the client, never a completed answer.
      if (!controller.signal.aborted) response.destroy();
    } finally {
      clearTimeout(deadline);
      response.off('close', end);
      controller.abort();
      active--;
      if (!response.destroyed) response.end();
    }
  };
}
