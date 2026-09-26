import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ProviderMode } from '@svara/contracts';

/** Restricts experimental tools to a local host; the studio layout also requires staff.
 * Live mode is allowed locally so the lab can drive real providers, never in production. */
export async function requireLocalPreview(): Promise<ProviderMode> {
  const host = (await headers()).get('host') ?? '';
  const mode = process.env.PROVIDER_MODE;
  let localHost = false;
  try {
    localHost = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${host}`).hostname);
  } catch {
    /* An invalid Host cannot grant preview access. */
  }
  if (process.env.APP_ENV !== 'local' || !localHost || (mode !== 'fixture' && mode !== 'live'))
    notFound();
  return mode;
}
