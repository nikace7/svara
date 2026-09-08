import { Queue, Worker } from 'bullmq';
import { resourceIdSchema } from '@svara/contracts';
import type { MediaJobs, MediaJobOutcome } from '@svara/domain';

type Jobs = Pick<MediaJobs, 'process' | 'pending' | 'sweep' | 'close'>;
type Notification = { assetId: string };

export class MediaQueueRuntime {
  private readonly queue: Queue<Notification, MediaJobOutcome, 'inspect'>;
  private readonly worker: Worker<Notification, MediaJobOutcome, 'inspect'>;
  private readonly stopping = new AbortController();
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private started = false;
  private lastSuccess = 0;
  private lastProbe = 0;
  private connectionReady = () => false;
  private failureReported = false;

  constructor(
    redisUrl: string,
    private readonly jobs: Jobs,
    private readonly probe: (signal: AbortSignal) => Promise<void>,
    options: { prefix?: string; intervalMs?: number } = {},
  ) {
    this.intervalMs = options.intervalMs ?? 5000;
    if (!Number.isInteger(this.intervalMs) || this.intervalMs < 100 || this.intervalMs > 5000)
      throw new Error('Invalid media reconciliation interval.');
    const prefix = options.prefix ?? 'svara:media';
    const connection = {
      url: redisUrl,
      connectTimeout: 1500,
      retryStrategy: (attempt: number) => Math.min(attempt * 250, 2000),
    };
    this.queue = new Queue('media-inspection', {
      prefix,
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        commandTimeout: 1500,
      },
      streams: { events: { maxLen: 1000 } },
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    });
    this.worker = new Worker(
      'media-inspection',
      async (job) => {
        const parsed = resourceIdSchema.safeParse(job.data?.assetId);
        if (job.name !== 'inspect' || !parsed.success)
          throw new Error('Invalid media notification.');
        const outcome = await this.jobs.process(parsed.data, this.stopping.signal);
        if (outcome === 'RETRY') {
          this.lastProbe = 0;
          this.lastSuccess = 0;
        }
        return outcome;
      },
      {
        prefix,
        connection: { ...connection, maxRetriesPerRequest: null },
        autorun: false,
        concurrency: 1,
        lockDuration: 30_000,
        stalledInterval: 15_000,
        maxStalledCount: 1,
        removeOnComplete: { count: 0 },
        removeOnFail: { count: 0 },
      },
    );
    const connectionError = () => {
      this.reportFailure('media.queue.connection.failed');
    };
    this.queue.on('error', connectionError);
    this.worker.on('error', connectionError);
    this.worker.on('failed', (job) => {
      this.lastSuccess = 0;
      const assetId = resourceIdSchema.safeParse(job?.data?.assetId);
      console.error(
        JSON.stringify({
          event: 'media.queue.job.failed',
          ...(assetId.success ? { assetId: assetId.data } : {}),
        }),
      );
    });
    void Promise.all([
      this.queue.getBackend().client,
      this.worker.getBackend().client,
      this.worker.getBackend().blockingClient,
    ])
      .then(([producer, client, blocking]) => {
        this.connectionReady = () =>
          producer.status === 'ready' && client.status === 'ready' && blocking?.status === 'ready';
      })
      .catch(connectionError);
  }

  start(): void {
    if (this.started || this.stopping.signal.aborted) return;
    this.started = true;
    void this.loop();
  }
  isReady(): boolean {
    return (
      this.started &&
      !this.stopping.signal.aborted &&
      Date.now() - this.lastSuccess < 15_000 &&
      this.connectionReady() &&
      this.worker.isRunning() &&
      !this.worker.isPaused()
    );
  }
  private async reconcile(): Promise<void> {
    if (!this.connectionReady()) throw new Error('Media queue is unavailable.');
    if (!this.lastProbe || Date.now() - this.lastProbe >= 60_000) {
      await this.probe(this.stopping.signal);
      this.lastProbe = Date.now();
    }
    if (this.stopping.signal.aborted) return;
    await this.jobs.sweep();
    if (this.stopping.signal.aborted) return;
    await this.queue.getWaitingCount();
    if (this.worker.isPaused()) this.worker.resume();
    else if (!this.worker.isRunning()) {
      void this.worker.run().catch(() => {
        this.reportFailure('media.queue.consumer.failed');
      });
    }
    const pending = await this.jobs.pending();
    if (this.stopping.signal.aborted) return;
    if (pending.length)
      await this.queue.addBulk(
        pending.map((assetId) => ({
          name: 'inspect' as const,
          data: { assetId },
          opts: { jobId: assetId },
        })),
      );
    this.lastSuccess = Date.now();
    if (this.failureReported) {
      console.info(JSON.stringify({ event: 'media.queue.recovered' }));
      this.failureReported = false;
    }
  }
  private reportFailure(event: string): void {
    this.lastSuccess = 0;
    if (this.stopping.signal.aborted || this.failureReported) return;
    this.failureReported = true;
    console.error(JSON.stringify({ event }));
  }
  tick(): Promise<void> {
    if (this.stopping.signal.aborted) return Promise.resolve();
    this.inFlight ??= this.reconcile()
      .catch(async () => {
        this.reportFailure('media.queue.reconcile.failed');
        if (this.worker.isRunning()) {
          try {
            await this.worker.pause(true);
          } catch {
            this.reportFailure('media.queue.pause.failed');
          }
        }
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }
  private async loop(): Promise<void> {
    await this.tick();
    if (!this.stopping.signal.aborted)
      this.timer = setTimeout(() => {
        void this.loop();
      }, this.intervalMs);
  }
  close(): Promise<void> {
    this.closing ??= this.shutdown();
    return this.closing;
  }
  private async shutdown(): Promise<void> {
    this.stopping.abort();
    clearTimeout(this.timer);
    try {
      await this.worker.close();
    } finally {
      await this.inFlight;
      try {
        await this.queue.close();
      } finally {
        await this.jobs.close();
      }
    }
  }
}
