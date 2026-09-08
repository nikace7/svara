import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffResponse } from './staff-api';

afterEach(() => vi.unstubAllGlobals());

describe('staff browser request ownership', () => {
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
});
