import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export function createDatabase(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
      max: 5,
    }),
  });
}

export { PrismaClient } from './generated/client.js';
export { assertDemoDatabase, assertTestDatabase } from './safety.js';
