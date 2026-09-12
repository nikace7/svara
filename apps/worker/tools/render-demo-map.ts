import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = fileURLToPath(
  new URL('../../../fixtures/media/himal-campus-map.svg', import.meta.url),
);
const destination = fileURLToPath(
  new URL('../../../fixtures/media/himal-campus-map.png', import.meta.url),
);
await sharp(source).png({ compressionLevel: 9 }).toFile(destination);
console.info('Rendered the original fictional campus schematic.');
