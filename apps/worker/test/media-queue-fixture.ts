import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';

export function mediaQueueFixture(redisUrl: string) {
  const prefix = `svara:test:media-${randomUUID()}`;
  const queue = new Queue('media-inspection', {
    prefix,
    connection: { url: redisUrl, maxRetriesPerRequest: 1 },
  });
  return {
    prefix,
    async discardNotification(assetId: string) {
      await queue.add('inspect', { assetId }, { jobId: assetId });
      await queue.drain();
      return queue.getWaitingCount();
    },
    async failedCount() {
      return queue.getFailedCount();
    },
    async close() {
      if (!/^svara:test:media-[a-f0-9-]{36}$/.test(prefix))
        throw new Error('Unsafe test queue cleanup.');
      await queue.obliterate({ force: true });
      await queue.close();
    },
  };
}
