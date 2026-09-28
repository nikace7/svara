import { SCHEDULE_LIMITS } from '@svara/contracts';
import type { ClaimedCommand, CommandOutbox } from '@svara/domain';

type Outbox = Pick<CommandOutbox, 'reconcileDue' | 'claim' | 'expire'>;

/**
 * Desired-state reconciliation every five seconds (and at startup), and a command scan every
 * second. PostgreSQL stays the journal: `notify` is only a wake-up carrying IDs, so a lost
 * notification is repaired by the next scan and a failed tick is simply retried.
 */
export class ScheduleLoop {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private closed = false;
  private ticks = 0;
  private lastSuccess = 0;
  private failureReported = false;

  constructor(
    private readonly outbox: Outbox,
    private readonly notify: (commands: ClaimedCommand[]) => Promise<void>,
    private readonly options: {
      scanMs?: number;
      reconcileEvery?: number;
      /** Runs with each reconciliation: ends conversations past their idle or absolute limit. */
      sweep?: () => Promise<unknown>;
    } = {},
  ) {}

  start(): void {
    this.schedule(0);
  }

  /** Ready while ticks keep succeeding; three missed reconciliation periods mean stalled. */
  isReady(now = Date.now()): boolean {
    return !this.closed && now - this.lastSuccess < SCHEDULE_LIMITS.reconcileMilliseconds * 3;
  }

  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.timer);
    await this.running;
  }

  async tick(): Promise<void> {
    const reconcileEvery =
      this.options.reconcileEvery ??
      SCHEDULE_LIMITS.reconcileMilliseconds / SCHEDULE_LIMITS.commandScanMilliseconds;
    if (this.ticks++ % reconcileEvery === 0) {
      await this.outbox.reconcileDue();
      await this.options.sweep?.();
    }
    await this.outbox.expire();
    const claimed = await this.outbox.claim();
    if (claimed.length) await this.notify(claimed);
  }

  private schedule(delay: number): void {
    if (this.closed) return;
    this.timer = setTimeout(() => {
      this.running = this.tick()
        .then(() => {
          this.lastSuccess = Date.now();
          this.failureReported = false;
        })
        .catch(() => {
          // Report the first failure of a run only; the next tick retries from the database.
          if (!this.failureReported)
            console.error(JSON.stringify({ event: 'worker.schedules.failed' }));
          this.failureReported = true;
        })
        .finally(() => {
          this.running = undefined;
          this.schedule(this.options.scanMs ?? SCHEDULE_LIMITS.commandScanMilliseconds);
        });
    }, delay);
  }
}
