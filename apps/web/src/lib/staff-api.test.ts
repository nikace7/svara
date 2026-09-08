import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffResponse } from './staff-api.js';

describe('staff browser transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('never replaces a form CSRF token with one from a newly switched workspace', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ data: { csrfToken: 'new-workspace' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetcher);
    await staffResponse('/organisation', {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': 'rendered-workspace' },
      body: '{}',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('X-CSRF-Token')).toBe(
      'rendered-workspace',
    );
  });
  it('fails before a protected mutation if the rendered session token is missing', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ data: { csrfToken: 'new-workspace' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(staffResponse('/organisation', { method: 'PATCH', body: '{}' })).rejects.toThrow(
      'Refresh',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('lets the browser encode multipart boundaries while keeping the rendered CSRF token', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    const body = new FormData();
    body.append('metadata', '{}');
    await staffResponse('/media', {
      method: 'POST',
      body,
      headers: { 'X-CSRF-Token': 'rendered-token' },
    });
    const options = fetch.mock.calls[0]![1] as RequestInit;
    expect(options.body).toBe(body);
    expect(new Headers(options.headers).has('content-type')).toBe(false);
    expect(new Headers(options.headers).get('x-csrf-token')).toBe('rendered-token');
    expect(options.credentials).toBe('same-origin');
  });
  it('preserves actionable media quota feedback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'MEDIA_QUOTA',
              message: 'Remove unused files or wait for pending uploads.',
            },
          }),
          { status: 429 },
        ),
      ),
    );
    await expect(staffResponse('/media')).rejects.toMatchObject({
      code: 'MEDIA_QUOTA',
      message: 'Remove unused files or wait for pending uploads.',
    });
  });
});
