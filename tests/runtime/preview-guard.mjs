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
    APP_ORIGIN: 'https://studio.example.test',
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
        redirect: 'manual',
      });
      break;
    } catch {
      if (server.exitCode !== null)
        throw new Error('Preview guard test server exited before serving.');
      await delay(250);
    }
  }
  assert.equal(response?.status, 307, 'Studio must require staff login before reaching the API.');
  assert.equal(response.headers.get('location'), '/login');
  for (const path of ['/studio/design-system', '/studio/voice-lab']) {
    const preview = await globalThis.fetch(`http://127.0.0.1:4319${path}`, { redirect: 'manual' });
    // The parallel layout and page gates can finish in either order; neither serves a preview.
    assert.ok([307, 404].includes(preview.status), 'Production preview access must be denied.');
    if (preview.status === 307) assert.equal(preview.headers.get('location'), '/login');
  }
  process.stdout.write('Production studio requires login; local-only previews remain denied.\n');
} finally {
  if (server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
}
