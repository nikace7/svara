import { describe, expect, it, vi } from 'vitest';
import { ScheduleLoop } from './loop.js';

const command = { id: 'command', deviceId: 'device', organisationId: 'organisation' };

describe('schedule loop', () => {
  it('reconciles on the first tick and every fifth, and wakes devices only for claims', async () => {
    const outbox = {
      reconcileDue: vi.fn(async () => 0),
      expire: vi.fn(async () => 0),
      claim: vi.fn(async () => [] as (typeof command)[]),
    };
    const notify = vi.fn(async () => {});
    const loop = new ScheduleLoop(outbox, notify);
    for (let tick = 0; tick < 6; tick++) await loop.tick();
    expect(outbox.reconcileDue).toHaveBeenCalledTimes(2);
    expect(outbox.expire).toHaveBeenCalledTimes(6);
    expect(notify).not.toHaveBeenCalled();
    outbox.claim.mockResolvedValueOnce([command]);
    await loop.tick();
    expect(notify).toHaveBeenCalledWith([command]);
  });

  it('keeps running after a failed tick and reports readiness from recent success', async () => {
    vi.useFakeTimers();
    try {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const outbox = {
        reconcileDue: vi.fn(async () => 0),
        expire: vi.fn(async () => 0),
        claim: vi
          .fn()
          .mockRejectedValueOnce(new Error('database restarting'))
          .mockResolvedValue([]),
      };
      const loop = new ScheduleLoop(outbox, async () => {}, { scanMs: 1000 });
      expect(loop.isReady()).toBe(false);
      loop.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(error).toHaveBeenCalledTimes(1);
      expect(loop.isReady()).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(outbox.claim).toHaveBeenCalledTimes(2);
      expect(loop.isReady()).toBe(true);
      await loop.close();
      expect(loop.isReady()).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      expect(outbox.claim).toHaveBeenCalledTimes(2);
      error.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
