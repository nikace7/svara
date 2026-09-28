'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { assistantLinkSchema, releasePageSchema } from '@svara/contracts';
import type { AssistantLink, BotPage } from '@svara/contracts';
import { z } from 'zod';
import { errorMessage } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';

/** Public assistant links: each pins one published release and can be switched off at once. */
export function AssistantLinks() {
  const { identity } = useStaffSession();
  const send = useStaffRequest();
  const queryClient = useQueryClient();
  const membership = identity.membership.id;
  const canManage = ['OWNER', 'ADMINISTRATOR'].includes(identity.membership.role);
  const [botId, setBotId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const links = useQuery({
    queryKey: ['assistant-links', membership],
    queryFn: async ({ signal }) =>
      z.array(assistantLinkSchema).parse(await send<unknown>('/assistant-links', { signal })),
  });
  const bots = useQuery({
    queryKey: ['bots', membership, 'links'],
    queryFn: ({ signal }) => send<BotPage>('/bots?page=1', { signal }),
    enabled: canManage,
  });
  const chosenBot = botId || bots.data?.items[0]?.id || '';
  const releases = useQuery({
    queryKey: ['releases', membership, chosenBot, 'published'],
    queryFn: async ({ signal }) =>
      releasePageSchema.parse(
        await send<unknown>(
          `/bots/${chosenBot}/releases?${new URLSearchParams({ kind: 'PUBLISHED', page: '1', pageSize: '50' })}`,
          { signal },
        ),
      ),
    enabled: canManage && !!chosenBot,
  });
  async function change(action: () => Promise<unknown>) {
    setPending(true);
    setError('');
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['assistant-links'] });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const form = event.currentTarget;
    void change(async () => {
      await send('/assistant-links', {
        method: 'POST',
        body: JSON.stringify({
          releaseId: input.get('releaseId'),
          label: String(input.get('label') ?? '').trim(),
        }),
      });
      form.reset();
    });
  }
  function toggle(link: AssistantLink) {
    void change(() =>
      send(`/assistant-links/${link.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          releaseId: link.releaseId,
          label: link.label,
          enabled: !link.enabled,
          expiresAt: link.expiresAt,
          expectedRevision: link.revision,
        }),
      }),
    );
  }
  return (
    <section className="panel" aria-labelledby="links-heading">
      <div className="panel-heading">
        <div>
          <h2 id="links-heading">Public assistant links</h2>
          <p className="muted">
            Anyone with a link can talk to its pinned release. Knowledge itself is never shown, and
            turning a link off ends its open conversations immediately.
          </p>
        </div>
      </div>
      {error && (
        <p className="form-notice form-notice--error" role="alert">
          {error}
        </p>
      )}
      {links.isError && (
        <p className="form-notice form-notice--error" role="alert">
          {errorMessage(links.error)}
        </p>
      )}
      {links.data?.length === 0 && <p className="muted table-empty">No public links yet.</p>}
      {links.data?.map((link) => (
        <div key={link.id} className="link-row">
          <div>
            <strong>{link.label || 'Untitled link'}</strong>{' '}
            <StatusBadge tone={link.enabled ? 'success' : 'neutral'}>
              {link.enabled ? 'On' : 'Off'}
            </StatusBadge>
            <p className="muted">
              {link.botName} v{link.releaseVersion} · {link.activeSessions} open conversation
              {link.activeSessions === 1 ? '' : 's'}
            </p>
            <code>{`/assistant/${link.slug}`}</code>
          </div>
          <div className="link-actions">
            <a
              className="button button--secondary"
              href={`/assistant/${link.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open
            </a>
            {canManage && (
              <Button
                variant={link.enabled ? 'destructive' : 'secondary'}
                disabled={pending}
                onClick={() => toggle(link)}
                aria-label={`${link.enabled ? 'Turn off' : 'Turn on'} ${link.label || link.slug}`}
              >
                {link.enabled ? 'Turn off' : 'Turn on'}
              </Button>
            )}
          </div>
        </div>
      ))}
      {canManage && (
        <form className="staff-form link-row" onSubmit={create}>
          <div className="link-actions">
            <div className="field">
              <label htmlFor="link-bot">Bot</label>
              <select
                id="link-bot"
                className="input"
                value={chosenBot}
                onChange={(event) => setBotId(event.target.value)}
              >
                {bots.data?.items.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="link-release">Published release</label>
              <select id="link-release" name="releaseId" className="input" required>
                {releases.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    Version {item.version}
                  </option>
                ))}
              </select>
            </div>
            <FormField label="Label" name="label" maxLength={120} disabled={pending} />
          </div>
          <Button type="submit" disabled={pending || !releases.data?.items.length}>
            Create link
          </Button>
        </form>
      )}
    </section>
  );
}
