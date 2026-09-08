import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkReadiness } from './health.js';

afterEach(() => vi.useRealTimers());

describe('dependency readiness', () => {
  it('reports ready only after every dependency succeeds', async () => {
    const result = await checkReadiness({
      database: async () => {},
      redis: async () => {},
      media: async () => {},
    });
    expect(result).toEqual({
      status: 'ready',
      dependencies: { database: 'ready', redis: 'ready', media: 'ready' },
    });
  });

  it('reports failure categories without leaking infrastructure errors', async () => {
    const result = await checkReadiness({
      database: async () => {
        throw new Error('password=secret');
      },
      redis: async () => {},
    });
    expect(result).toEqual({
      status: 'unavailable',
      dependencies: { database: 'unavailable', redis: 'ready' },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('bounds a stalled dependency check', async () => {
    vi.useFakeTimers();
    const pending = checkReadiness({ redis: () => new Promise<void>(() => {}) }, 50);
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toEqual({
      status: 'unavailable',
      dependencies: { redis: 'unavailable' },
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
