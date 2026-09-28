import {
  conversationAdmissionSchema,
  conversationSessionSchema,
  turnEventSchema,
} from '@svara/contracts';
import type {
  ConversationAdmission,
  ConversationSession,
  Locale,
  TurnEvent,
} from '@svara/contracts';

/** Who is talking. Each audience has its own route family and cookie; CSRF comes from it. */
export type ConversationAudience =
  | { kind: 'staff'; csrfToken: string }
  | { kind: 'device'; csrfToken: string }
  | { kind: 'visitor'; slug: string; csrfToken: string };

export class ConversationApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function conversationBase(audience: ConversationAudience): string {
  if (audience.kind === 'staff') return '/api/v1/voice-sessions';
  if (audience.kind === 'device') return '/api/v1/runtime/voice-sessions';
  return `/api/v1/public/assistants/${encodeURIComponent(audience.slug)}/voice-sessions`;
}

async function failure(response: Response): Promise<ConversationApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  return new ConversationApiError(
    response.status,
    body.error?.code ?? (response.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE'),
    body.error?.message ??
      (response.status === 429
        ? 'Too many requests. Wait a moment and try again.'
        : 'The assistant is unavailable. Try again shortly.'),
  );
}

export interface ConversationApi {
  admit(input: {
    locale: Locale;
    releaseId?: string;
    resumeFrom?: string;
  }): Promise<ConversationAdmission>;
  turn(
    sessionId: string,
    input: {
      generation: number;
      clientMessageId: string;
      locale: Locale;
      text?: string;
      audio?: string;
      retryOf?: string;
    },
    signal: AbortSignal,
  ): Promise<Response>;
  interrupt(sessionId: string, generation: number): Promise<ConversationSession>;
  end(sessionId: string): Promise<ConversationSession>;
}

export function conversationApi(audience: ConversationAudience): ConversationApi {
  const base = conversationBase(audience);
  const post = async (path: string, body: unknown, signal?: AbortSignal) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': audience.csrfToken },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(15000),
    });
    if (!response.ok) throw await failure(response);
    return response;
  };
  const data = async (response: Response) => ((await response.json()) as { data: unknown }).data;
  return {
    admit: async (input) => conversationAdmissionSchema.parse(await data(await post('', input))),
    // A long spoken answer streams for up to two minutes; the caller's signal owns cancellation.
    turn: (sessionId, input, signal) => post(`/${sessionId}/turns`, input, signal),
    interrupt: async (sessionId, generation) =>
      conversationSessionSchema.parse(
        await data(await post(`/${sessionId}/interrupt`, { generation })),
      ),
    end: async (sessionId) =>
      conversationSessionSchema.parse(await data(await post(`/${sessionId}/end`, {}))),
  };
}

/** Speech failure is reported mid-stream; the text answer carries on. */
export const isTerminal = (event: TurnEvent) =>
  event.type === 'complete' || (event.type === 'error' && event.code !== 'TTS_UNAVAILABLE');

/**
 * Reads one turn's NDJSON stream strictly: one turn, one generation, contiguous sequence
 * numbers and nothing after the terminal event. A stream that stops early throws.
 */
export async function* readTurnStream(
  response: Response,
  generation: number,
): AsyncGenerator<TurnEvent> {
  if (!response.body) throw new Error('The answer stream is unavailable.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let sequence = 0;
  let turnId: string | undefined;
  let done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      for (let split = buffer.indexOf('\n'); split >= 0; split = buffer.indexOf('\n')) {
        if (split > 16000) throw new Error('An answer event exceeded its size limit.');
        const event = turnEventSchema.parse(JSON.parse(buffer.slice(0, split)));
        buffer = buffer.slice(split + 1);
        if (
          done ||
          event.generation !== generation ||
          event.seq !== sequence++ ||
          (turnId !== undefined && turnId !== event.turnId)
        )
          throw new Error('The answer stream changed unexpectedly.');
        turnId = event.turnId;
        done = isTerminal(event);
        yield event;
      }
      if (buffer.length > 16000) throw new Error('An answer event exceeded its size limit.');
      if (chunk.done) break;
    }
    if (!done || buffer.trim())
      throw new Error('The connection dropped before the answer finished.');
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
