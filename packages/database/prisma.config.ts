import { defineConfig } from 'prisma/config';
import { loadWorkspaceEnvironment } from '../config/src/server.js';

loadWorkspaceEnvironment();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generation is offline; migration entrypoints separately require and guard the URL.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
