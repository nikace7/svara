import { once } from 'node:events';
import type { Response } from 'express';
import type { TurnEvent } from '@svara/contracts';
import { runConversationTurn } from '@svara/domain';
import type { ConversationActor, ConversationService, TurnRunner } from '@svara/domain';

/** The answer in flight for each session in this process; a newer turn or an interrupt stops it.
 * ponytail: per process. Other API processes are stopped by the database generation check. */
export class ActiveTurns {
  private readonly turns = new Map<string, AbortController>();
  begin(sessionId: string): AbortController {
    this.turns.get(sessionId)?.abort();
    const controller = new AbortController();
    this.turns.set(sessionId, controller);
    return controller;
  }
  stop(sessionId: string): void {
    this.turns.get(sessionId)?.abort();
  }
  finish(sessionId: string, controller: AbortController): void {
    if (this.turns.get(sessionId) === controller) this.turns.delete(sessionId);
  }
}

export interface TurnStreaming {
  service: Pick<ConversationService, 'beginTurn' | 'stillCurrent'>;
  runner: TurnRunner;
  active: ActiveTurns;
}

const TURN_DEADLINE_MS = 120_000;
/** Before these the answer is re-checked against the database, so a disabled link, an ended
 * session or a newer generation in another process stops it. */
const checked = new Set<TurnEvent['type']>(['answer', 'tool', 'complete']);

/** Streams one turn as NDJSON. Failures before the first byte become ordinary JSON errors. */
export async function streamTurn(
  response: Response,
  actor: ConversationActor,
  sessionId: string,
  body: unknown,
  streaming: TurnStreaming,
): Promise<void> {
  const turn = await streaming.service.beginTurn(actor, sessionId, body);
  const controller = streaming.active.begin(sessionId);
  const stop = () => controller.abort();
  const deadline = setTimeout(stop, TURN_DEADLINE_MS);
  response.once('close', stop);
  response.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
  let last: TurnEvent | undefined;
  try {
    for await (const event of runConversationTurn(
      actor,
      turn,
      streaming.runner,
      controller.signal,
    )) {
      if (checked.has(event.type) && !(await streaming.service.stillCurrent(turn))) {
        const ended: TurnEvent = {
          v: 1,
          sessionId: event.sessionId,
          turnId: event.turnId,
          generation: event.generation,
          seq: event.seq,
          elapsedMs: event.elapsedMs,
          type: 'error',
          code: 'SESSION_ENDED',
          text: 'This conversation has ended. Start a new one.',
          providerMode: event.providerMode,
          audio: event.audio,
        };
        response.write(`${JSON.stringify(ended)}\n`);
        controller.abort();
        break;
      }
      last = event;
      if (!response.write(`${JSON.stringify(event)}\n`))
        await once(response, 'drain', { signal: controller.signal });
    }
  } catch {
    // A truncated stream is a failure at the client, never a completed answer.
    if (!controller.signal.aborted) {
      console.error(
        JSON.stringify({ event: 'conversation.turn.failed', sessionId, lastSeq: last?.seq }),
      );
      response.destroy();
    }
  } finally {
    clearTimeout(deadline);
    response.off('close', stop);
    streaming.active.finish(sessionId, controller);
    if (!response.destroyed && !response.writableEnded) response.end();
  }
}
