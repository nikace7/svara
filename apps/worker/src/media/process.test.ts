import { describe, expect, it } from 'vitest';
import { runMediaProcess } from './process.js';

describe('bounded media subprocess', () => {
  it('returns bounded output without inheriting application credentials', async () => {
    process.env.SVARA_TEST_PRIVATE_INSPECTION = 'synthetic-secret';
    try {
      const result = await runMediaProcess(
        process.execPath,
        [
          '-e',
          'process.stdout.write(JSON.stringify({secret:process.env.SVARA_TEST_PRIVATE_INSPECTION??null}))',
        ],
        { timeoutMs: 3000 },
      );
      expect(JSON.parse(result.stdout)).toEqual({ secret: null });
      expect(result.exitCode).toBe(0);
    } finally {
      delete process.env.SVARA_TEST_PRIVATE_INSPECTION;
    }
  });

  it('kills and waits for a timed-out child', async () => {
    await expect(
      runMediaProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 150 }),
    ).rejects.toMatchObject({ code: 'INSPECTION_TIMEOUT' });
  });

  it('bounds stdout and stderr independently and reports a missing executable safely', async () => {
    for (const stream of ['stdout', 'stderr']) {
      await expect(
        runMediaProcess(process.execPath, ['-e', `process.${stream}.write('x'.repeat(70000))`], {
          timeoutMs: 3000,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MEDIA' });
    }
    await expect(
      runMediaProcess('svara-missing-test-executable', [], { timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: 'INSPECTION_UNAVAILABLE' });
  });
});
