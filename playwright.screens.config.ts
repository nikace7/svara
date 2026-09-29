import { defineConfig } from '@playwright/test';
import live from './playwright.live.config.js';

/** The handoff screenshot set (docs/DEMO.md), captured on the test stack in honest demo mode. */
export default defineConfig({
  ...live,
  testMatch: /screenshots\.spec\.ts/,
  use: { ...live.use, viewport: { width: 1920, height: 1200 } },
  webServer: {
    ...(live.webServer as object),
    command: 'node --import tsx tests/e2e/live-stack.ts',
    env: { SVARA_STACK_MODE: 'fixture' },
    // Never reuse a live-mode stack: every capture must be labelled with the mode it shows.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
