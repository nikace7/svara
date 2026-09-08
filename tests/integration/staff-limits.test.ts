import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadWorkspaceEnvironment, parseServerConfig } from '../../packages/config/src/server.js';
import { assertTestDatabase } from '../../packages/database/src/safety.js';
import { createDependencies } from '../../packages/domain/src/dependencies.js';
import { createStaffLimiter } from '../../packages/domain/src/identity/limits.js';

let dependencies: Awaited<ReturnType<typeof createDependencies>>;
beforeAll(async () => {
  loadWorkspaceEnvironment();
  const url = process.env.TEST_DATABASE_URL ?? '';
  assertTestDatabase(url, 'test');
  dependencies = await createDependencies(parseServerConfig({ ...process.env, DATABASE_URL: url }));
});
afterAll(async () => {
  await dependencies?.close();
});

it('shares an atomic quota across API instances, hides the subject and expires its window', async () => {
  const pepper = randomBytes(48).toString('hex');
  const first = createStaffLimiter(dependencies.redis, pepper);
  const second = createStaffLimiter(dependencies.redis, pepper);
  const bucket = `test-${randomUUID()}`;
  const email = 'synthetic-staff@example.test';
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => (i % 2 ? first : second)(bucket, email, 3, 1200)),
  );
  expect(results.filter((result) => result === 0)).toHaveLength(3);
  expect(results.filter((result) => result > 0)).toHaveLength(5);
  const keys = await dependencies.redis.keys(`svara:rate:${bucket}:*`);
  expect(keys).toHaveLength(1);
  expect(keys[0]).not.toContain(email);
  expect(await dependencies.redis.pttl(keys[0]!)).toBeGreaterThan(0);
  await expect.poll(() => first(bucket, email, 3, 1200), { interval: 250, timeout: 3000 }).toBe(0);
});
