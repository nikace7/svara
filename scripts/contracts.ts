import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { createApplication, createOpenApiDocument } from '../apps/api/dist/app.js';

const operation = process.argv[2];
if (operation !== 'generate' && operation !== 'check')
  throw new Error('Expected generate or check.');
const app = await createApplication({
  providerMode: 'fixture',
  localDocs: false,
  probe: async () => ({ status: 'unavailable', dependencies: {} }),
});
try {
  const document = createOpenApiDocument(app);
  const json = `${JSON.stringify(document, null, 2)}\n`;
  const types = astToString(await openapiTS(JSON.parse(json)));
  for (const [relative, content] of [
    ['../packages/contracts/openapi.json', json],
    ['../packages/contracts/src/http.generated.ts', types],
  ] as const) {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    if (operation === 'generate') await writeFile(path, content);
    else if ((await readFile(path, 'utf8')) !== content)
      throw new Error(
        `Contract drift: ${relative}. Run pnpm contracts:generate and review the changes.`,
      );
  }
  console.info(
    operation === 'check'
      ? 'OpenAPI and HTTP types match the API.'
      : 'Generated OpenAPI and HTTP types.',
  );
} finally {
  await app.close();
}
