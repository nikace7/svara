import { once } from 'node:events';
import type { Request, Response } from 'express';
import { FeasibilityRequestSchema } from '@svara/contracts';
import { runFixtureTurn } from '@svara/domain';
import { allowsLocalFeasibility } from './local-access.js';

/** Temporary local experiment; no persistence, provider keys or audio upload. */
export function createFeasibilityHandler(origin: string) {
  let active = 0;
  return async (request: Request, response: Response): Promise<void> => {
    if (!allowsLocalFeasibility(origin, request.headers.host, request.get('origin'))) {
      response
        .status(403)
        .json({ error: { code: 'FORBIDDEN', message: 'Local same-origin access required.' } });
      return;
    }
    const parsed = FeasibilityRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Choose one bounded input and an explicit locale.',
          },
        });
      return;
    }
    if (active >= 4) {
      response.setHeader('Retry-After', '2');
      response
        .status(429)
        .json({ error: { code: 'BUSY', message: 'The local lab is busy. Retry shortly.' } });
      return;
    }
    active++;
    const controller = new AbortController();
    const end = () => controller.abort();
    const deadline = setTimeout(end, 10000);
    response.once('close', end);
    response.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    try {
      for await (const event of runFixtureTurn(parsed.data, controller.signal)) {
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
