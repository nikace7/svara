import { describe, expect, it } from 'vitest';
import { deploymentState, retryDelay, selectActive } from './core.js';

const at = (minute: number) => new Date(Date.UTC(2026, 8, 27, 10, minute));
const row = (id: string, kind: 'SCHEDULED' | 'OVERRIDE', from: number, to: number) => ({
  id,
  kind,
  releaseId: `${id}-release`,
  startsAt: at(from),
  endsAt: at(to),
  cancelledAt: null as Date | null,
});

describe('desired deployment selection', () => {
  it('prefers an active override, then an active schedule, then idle', () => {
    const rows = [row('schedule', 'SCHEDULED', 0, 60), row('override', 'OVERRIDE', 10, 20)];
    expect(selectActive(rows, at(5))?.id).toBe('schedule');
    expect(selectActive(rows, at(10))?.id).toBe('override');
    expect(selectActive(rows, at(20))?.id).toBe('schedule');
    expect(selectActive(rows, at(60))).toBeUndefined();
  });

  it('treats intervals as [start, end) and ignores cancelled rows', () => {
    const first = row('first', 'SCHEDULED', 0, 30);
    const second = row('second', 'SCHEDULED', 30, 60);
    expect(selectActive([first, second], at(30))?.id).toBe('second');
    expect(selectActive([{ ...second, cancelledAt: at(1) }], at(40))).toBeUndefined();
  });

  it('labels deployments by the current instant', () => {
    const value = row('schedule', 'SCHEDULED', 10, 20);
    expect(deploymentState(value, at(5))).toBe('UPCOMING');
    expect(deploymentState(value, at(10))).toBe('ACTIVE');
    expect(deploymentState(value, at(20))).toBe('ENDED');
    expect(deploymentState({ ...value, cancelledAt: at(1) }, at(15))).toBe('CANCELLED');
  });
});

describe('command retry schedule', () => {
  it('backs off 1, 2, 4 and 8 seconds, then retries every 15 seconds', () => {
    expect([1, 2, 3, 4, 5, 6, 40].map(retryDelay)).toEqual([
      1000, 2000, 4000, 8000, 15000, 15000, 15000,
    ]);
  });
});
