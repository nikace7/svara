import 'server-only';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { StaffSession } from './staff-api';

/** Reads only the staff cookie and a configured internal destination, never an incoming URL. */
export async function requireStaffSession(): Promise<StaffSession> {
  const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:4320');
  const name = origin.protocol === 'https:' ? '__Host-svara-session' : 'svara-session';
  const candidates = (await cookies()).getAll(name);
  const token = candidates.length === 1 ? candidates[0]?.value : undefined;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) redirect('/login');
  const endpoint = new URL(
    '/api/v1/auth/session',
    process.env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:4100',
  );
  if (!['http:', 'https:'].includes(endpoint.protocol))
    throw new Error('Invalid internal API configuration.');
  const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = (endpoint.protocol === 'https:' ? httpsRequest : httpRequest)(
      endpoint,
      {
        headers: { Host: origin.host, Cookie: `${name}=${token}` },
        signal: AbortSignal.timeout(5000),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 262144) {
            response.destroy(new Error('Session response exceeded its limit.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 503,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.on('error', () => reject(new Error('The staff session service is unavailable.')));
    request.end();
  });
  if (result.status === 401) redirect('/login');
  if (result.status !== 200) throw new Error('The staff session service is unavailable.');
  return (JSON.parse(result.body) as { data: StaffSession }).data;
}
