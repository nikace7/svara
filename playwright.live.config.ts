import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

/** Live-mode voice lab journeys on their own stub-provider stack; see tests/e2e/live-stack.ts. */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /voice-lab-live\.spec\.ts/,
  workers: 1,
  use: {
    ...base.use,
    baseURL: 'http://localhost:4330',
    // Chromium's synthetic microphone, granted without a prompt, for spoken questions.
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {
    command: 'node --import tsx tests/e2e/live-stack.ts',
    url: 'http://localhost:4330/login',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
