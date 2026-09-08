import { copyFile, mkdir } from 'node:fs/promises';

const destination = new URL('../apps/web/public/audio/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ['worklet.js', 'pcm.js', 'playback.js'])
  await copyFile(
    new URL(`../packages/audio/dist/${name}`, import.meta.url),
    new URL(name, destination),
  );
console.info('Prepared browser-safe audio worklet modules.');
