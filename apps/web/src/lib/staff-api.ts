import type { components } from '@svara/contracts';

export type StaffSession = components['schemas']['StaffSessionData'];
export type StaffMember = components['schemas']['StaffMemberDto'];
export type AccessLink = components['schemas']['AccessLinkData'];
export const sessionExpiredEvent = 'svara:session-expired';

export class StaffApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
    /** Same-organisation deployments that blocked a schedule change. */
    readonly conflictIds: string[] = [],
  ) {
    super(message);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof StaffApiError
    ? error.message
    : 'We could not reach the studio. Check your connection and try again.';
}

export async function staffResponse(
  path: string,
  init: RequestInit = {},
  anonymous = false,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const mutation = !!init.method && init.method !== 'GET';
  if (mutation) {
    if (init.body instanceof FormData) headers.delete('Content-Type');
    else headers.set('Content-Type', 'application/json');
    // A fresh token fetched here could authorize an old form against a different workspace.
    if (!anonymous && !headers.get('X-CSRF-Token'))
      throw new StaffApiError(403, 'FORBIDDEN', 'Refresh the workspace before making changes.');
  }
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  if (response.ok) return response;
  if (response.status === 401 && !anonymous) window.dispatchEvent(new Event(sessionExpiredEvent));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Proxies can return non-JSON errors; retain a safe actionable failure.
  }
  const details = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
  const error = details && typeof details === 'object' ? details : {};
  const message =
    response.status === 429 && !('code' in error && error.code === 'MEDIA_QUOTA')
      ? `Too many attempts. Try again in ${response.headers.get('Retry-After') ?? 'a few'} seconds.`
      : 'message' in error && typeof error.message === 'string'
        ? error.message
        : 'This request could not be completed. Please try again.';
  throw new StaffApiError(
    response.status,
    'code' in error && typeof error.code === 'string' ? error.code : 'UNAVAILABLE',
    message,
    'fieldErrors' in error && error.fieldErrors && typeof error.fieldErrors === 'object'
      ? (error.fieldErrors as Record<string, string[]>)
      : {},
    'conflictIds' in error && Array.isArray(error.conflictIds)
      ? error.conflictIds.filter((id): id is string => typeof id === 'string')
      : [],
  );
}

export async function staffData<T>(
  path: string,
  init?: RequestInit,
  anonymous = false,
): Promise<T> {
  const response = await staffResponse(path, init, anonymous);
  return ((await response.json()) as { data: T }).data;
}

export function broadcastSessionChange(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('svara:staff');
  channel.postMessage('session.changed');
  channel.close();
}

/** Discard the router cache and all workspace resources when the cookie identity changes. */
export function navigateWithFreshSession(path: '/studio' | '/login'): void {
  window.location.replace(new URL(path, window.location.origin).href);
}
