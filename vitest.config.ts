import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/config/src/server.ts',
        'packages/contracts/src/events.ts',
        'packages/database/src/safety.ts',
        'packages/domain/src/health.ts',
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
