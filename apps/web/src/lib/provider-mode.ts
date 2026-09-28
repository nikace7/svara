import 'server-only';
import { connection } from 'next/server';
import type { ProviderMode } from '@svara/contracts';

/** Read per request: the server's configuration, never a build-time value. Configuration
 * requires a key for live mode, so live here means conversations reach real providers. */
export async function providerMode(): Promise<ProviderMode> {
  await connection();
  return process.env.PROVIDER_MODE === 'live' ? 'live' : 'fixture';
}
