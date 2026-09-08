import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'svara-sandbox-test-'));
try {
  const input = join(directory, 'input');
  const denied = join(directory, 'private');
  writeFileSync(input, 'synthetic media');
  writeFileSync(denied, 'synthetic private data');
  const result = execFileSync(
    '/usr/local/bin/svara-media-sandbox',
    ['--self-test', input, denied],
    {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 4096,
      env: { LANG: 'C' },
    },
  );
  assert.deepEqual(JSON.parse(result), { ok: true });
  console.info('Media sandbox denied unrelated reads, writes, process creation and networking.');
} finally {
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('svara-sandbox-test-'));
  rmSync(directory, { recursive: true, force: true });
}
