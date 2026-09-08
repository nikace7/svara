import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
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
  const video = join(directory, 'synthetic.mp4');
  execFileSync(
    '/usr/bin/ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=purple:s=32x24:r=10:d=0.4',
      '-c:v',
      'libx264',
      '-threads',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      video,
    ],
    { timeout: 5000, maxBuffer: 4096 },
  );
  const inspected = JSON.parse(
    execFileSync('/usr/local/bin/svara-media-sandbox', [video], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 4096,
      env: { LANG: 'C' },
    }),
  );
  assert.equal(inspected.streams[0].codec_name, 'h264');
  assert.equal(inspected.streams[0].width, 32);
  assert.equal(Number(inspected.format.duration), 0.4);
  console.info('Media sandbox denied unrelated reads, writes, process creation and networking.');
} finally {
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('svara-sandbox-test-'));
  rmSync(directory, { recursive: true, force: true });
}
