import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const server = spawn(process.execPath, ['apps/web/.next/standalone/apps/web/server.js'], {
  env: {
    ...process.env,
    APP_ENV: 'production',
    PROVIDER_MODE: 'fixture',
    HOSTNAME: '127.0.0.1',
    PORT: '4319',
  },
  stdio: 'ignore',
});

try {
  let response;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      response = await globalThis.fetch('http://127.0.0.1:4319/studio', {
        signal: globalThis.AbortSignal.timeout(1000),
      });
      break;
    } catch {
      if (server.exitCode !== null)
        throw new Error('Preview guard test server exited before serving.');
      await delay(250);
    }
  }
  assert.equal(response?.status, 404, 'Production must not expose the unauthenticated M0 studio.');
  const gallery = await globalThis.fetch('http://127.0.0.1:4319/studio/design-system');
  assert.equal(gallery.status, 404, 'Production must not expose the component gallery.');
  const lab = await globalThis.fetch('http://127.0.0.1:4319/studio/voice-lab');
  assert.equal(lab.status, 404, 'Production must not expose the unauthenticated voice lab.');
  process.stdout.write('Production studio and gallery access is denied (404).\n');
} finally {
  if (server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
}
