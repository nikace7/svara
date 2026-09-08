import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

/** Temporary M0 gate. Replace with authenticated staff access in M2. */
export async function requireLocalPreview(): Promise<void> {
  const host = (await headers()).get('host') ?? '';
  let localHost = false;
  try {
    localHost = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${host}`).hostname);
  } catch {
    /* An invalid Host cannot grant preview access. */
  }
  if (process.env.APP_ENV !== 'local' || process.env.PROVIDER_MODE !== 'fixture' || !localHost)
    notFound();
}
