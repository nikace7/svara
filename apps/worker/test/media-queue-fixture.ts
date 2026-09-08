import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';

export function mediaQueueFixture(redisUrl: string) {
  const namespace = `svara-test-${randomUUID()}`;
  const prefix = `${namespace}:media`;
  const queue = new Queue('media-inspection', {
    prefix,
    connection: { url: redisUrl, maxRetriesPerRequest: 1 },
  });
  return {
    namespace,
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
      if (!/^svara-test-[a-f0-9-]{36}:media$/.test(prefix))
        throw new Error('Unsafe test queue cleanup.');
      await queue.obliterate({ force: true });
      await queue.close();
    },
  };
}
