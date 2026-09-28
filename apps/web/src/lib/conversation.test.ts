import { describe, expect, it, vi } from 'vitest';
import { conversationApi, conversationBase, readTurnStream } from './conversation.js';

const sessionId = '00000000-0000-4000-8000-000000000002';
const make = (seq: number, type = 'answer', extra: Record<string, unknown> = {}) => ({
  v: 1,
  sessionId,
  turnId: '00000000-0000-4000-8000-000000000001',
  generation: 4,
  seq,
  elapsedMs: 2,
  type,
  text: 'कोठा १२।',
  providerMode: 'live',
  audio: 'streaming',
  ...extra,
});
const lines = (...events: object[]) =>
  new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(''));
async function read(response: Response) {
  const values = [];
  for await (const event of readTurnStream(response, 4)) values.push(event);
  return values;
}

describe('conversation routes', () => {
  it('gives each audience its own route family', () => {
    expect(conversationBase({ kind: 'staff', csrfToken: 'c' })).toBe('/api/v1/voice-sessions');
    expect(conversationBase({ kind: 'device', csrfToken: 'c' })).toBe(
      '/api/v1/runtime/voice-sessions',
    );
    expect(conversationBase({ kind: 'visitor', slug: 'abc123abc123', csrfToken: 'c' })).toBe(
      '/api/v1/public/assistants/abc123abc123/voice-sessions',
    );
  });

  it('sends CSRF with every call and surfaces the server’s safe error', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'SESSION_ENDED', message: 'This conversation has ended.' },
          }),
          { status: 409 },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    try {
      const api = conversationApi({ kind: 'device', csrfToken: 'token' });
      await expect(api.end(sessionId)).rejects.toMatchObject({
        status: 409,
        code: 'SESSION_ENDED',
        message: 'This conversation has ended.',
      });
      const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('token');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('turn stream validation', () => {
  it('continues past a speech failure and stops at completion', async () => {
    const events = await read(
      lines(make(0), make(1, 'error', { code: 'TTS_UNAVAILABLE' }), make(2), make(3, 'complete')),
    );
    expect(events.map((event) => event.type)).toEqual(['answer', 'error', 'answer', 'complete']);
  });

  it('rejects gaps, other generations, events after the end and truncated streams', async () => {
    for (const response of [
      lines(make(1)),
      lines({ ...make(0), generation: 5 }),
      lines(make(0, 'complete'), make(1)),
      lines(make(0)),
      lines(make(0, 'answer', { tool: { name: 'show_slide', status: 'APPLIED' } })),
    ])
      await expect(read(response)).rejects.toThrow();
  });
});
