'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '@svara/ui';
import { releasePageSchema } from '@svara/contracts';
import type { BotPage, ProviderMode, TurnEvent } from '@svara/contracts';
import { conversationApi } from '../lib/conversation';
import { errorMessage } from '../lib/staff-api';
import { ConversationPanel } from './conversation-panel';
import { useStaffRequest, useStaffSession } from './session-provider';

const greeting = {
  en: 'Ask a question to test this release.',
  ne: 'यो संस्करण जाँच्न प्रश्न सोध्नुहोस्।',
};

function describe(event: TurnEvent): string {
  if (event.type === 'transcript') return `Heard: “${event.text}”`;
  if (event.type === 'tool' && event.tool)
    return `${event.tool.name} → ${event.tool.status}${event.tool.reason ? ` (${event.tool.reason})` : ''}`;
  if (event.type === 'reference') return `Reference shown: ${event.text}`;
  if (event.type === 'error') return `${event.code ?? 'ERROR'}: ${event.text}`;
  const cited = event.citations?.map((item) => item.title).join(', ');
  return `Answered in ${Math.round(event.elapsedMs)} ms${cited ? ` · cited ${cited}` : ' · no citations'}`;
}

/** Staff test bench: a real session against a chosen release, with what the server decided. */
export function Playground({ mode }: { mode: ProviderMode }) {
  const { csrfToken, identity } = useStaffSession();
  const send = useStaffRequest();
  const membership = identity.membership.id;
  const [botId, setBotId] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const [log, setLog] = useState<TurnEvent[]>([]);
  // ponytail: first page of bots and newest 50 releases, as in the voice lab.
  const bots = useQuery({
    queryKey: ['bots', membership, 'playground'],
    queryFn: ({ signal }) => send<BotPage>('/bots?page=1', { signal }),
  });
  const chosenBot = botId || bots.data?.items[0]?.id || '';
  const releases = useQuery({
    queryKey: ['releases', membership, chosenBot, 'playground'],
    queryFn: async ({ signal }) =>
      releasePageSchema.parse(
        await send<unknown>(
          `/bots/${chosenBot}/releases?${new URLSearchParams({ kind: 'ALL', page: '1', pageSize: '50' })}`,
          { signal },
        ),
      ),
    enabled: !!chosenBot,
  });
  const release =
    releases.data?.items.find((item) => item.id === releaseId) ?? releases.data?.items[0];
  const problem = bots.isError
    ? errorMessage(bots.error)
    : releases.isError
      ? errorMessage(releases.error)
      : bots.data && !bots.data.items.length
        ? 'Create a bot and save a release before testing it here.'
        : releases.data && !release
          ? 'This bot has no saved releases. Save a preview or publish a version first.'
          : null;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONVERSATIONS</p>
          <h1>Playground</h1>
          <p className="page-description">
            Talk to a release exactly as visitors will, and see what it heard, cited and did.
          </p>
        </div>
        <StatusBadge tone={mode === 'live' ? 'success' : 'warning'}>
          {mode === 'live' ? 'Live providers' : 'Demo mode'}
        </StatusBadge>
      </div>
      <section className="panel voice-controls" aria-label="Release">
        <div className="field">
          <label htmlFor="playground-bot">Bot</label>
          <select
            id="playground-bot"
            className="input"
            value={chosenBot}
            onChange={(event) => {
              setBotId(event.target.value);
              setReleaseId('');
            }}
          >
            {bots.data?.items.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="playground-release">Release</label>
          <select
            id="playground-release"
            className="input"
            value={release?.id ?? ''}
            onChange={(event) => setReleaseId(event.target.value)}
          >
            {releases.data?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.kind === 'PUBLISHED' ? `Version ${item.version}` : 'Draft preview'}
              </option>
            ))}
          </select>
        </div>
        <p className="muted">
          Slides and event hours are kiosk tools. Test them on a paired kiosk in the{' '}
          <Link href="/studio/simulator">device simulator</Link>.
        </p>
      </section>
      {problem && (
        <p className="form-notice" role="status">
          {problem}
        </p>
      )}
      <div className="playground-grid">
        {release ? (
          <ConversationPanel
            key={release.id}
            api={conversationApi({ kind: 'staff', csrfToken })}
            providerMode={mode}
            greeting={greeting}
            releaseId={release.id}
            onEvent={(event) => {
              if (['transcript', 'tool', 'reference', 'complete', 'error'].includes(event.type))
                setLog((current) => [...current.slice(-40), event]);
            }}
            onReset={() => setLog([])}
            heading="Playground conversation"
          />
        ) : (
          <p className="muted">Choose a release to start.</p>
        )}
        <section className="panel playground-inspector" aria-labelledby="inspector-heading">
          <div className="panel-heading">
            <h2 id="inspector-heading">What happened</h2>
            <Link href="/studio/sessions" className="button button--quiet">
              All sessions
            </Link>
          </div>
          {log.length ? (
            <ol>
              {log.map((event) => (
                <li key={`${event.turnId}:${event.seq}`}>{describe(event)}</li>
              ))}
            </ol>
          ) : (
            <p className="muted panel-empty">
              Ask a question to see recognition, tools and citations.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
