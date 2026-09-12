'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Layers } from 'lucide-react';
import { Button } from '@svara/ui';
import {
  releaseDetailSchema,
  releasePageSchema,
  releaseReadinessSchema,
  resourceIdSchema,
} from '@svara/contracts';
import type { BotDetail, ReleaseDetail, ReleaseIssue } from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';
import { StudioLink } from './draft-navigation';
import { BotSections } from './bot-sections';
import { ReleaseCapture } from './release-capture';
import { ReleaseInspector } from './release-inspector';

function issueDestination(botId: string, issue: ReleaseIssue) {
  const [area, id] = issue.path.split('.');
  if (area === 'knowledge')
    return {
      href: `/studio/bots/${botId}/knowledge${resourceIdSchema.safeParse(id).success ? `/${id}` : ''}`,
      label: 'Review knowledge',
    };
  if (area === 'presentation')
    return { href: `/studio/bots/${botId}/presentation`, label: 'Review presentation' };
  if (area === 'media') return { href: '/studio/media', label: 'Review media' };
  return { href: `/studio/bots/${botId}`, label: 'Review identity' };
}

export function ReleaseWorkspace({ botId }: { botId: string }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const client = useQueryClient();
  const [kind, setKind] = useState<'ALL' | 'PREVIEW' | 'PUBLISHED'>('ALL');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const membership = identity.membership.id;
  const listKey = ['releases', membership, botId];
  const readinessKey = ['release-readiness', membership, botId];
  const bot = useQuery({
    queryKey: ['bot', membership, botId],
    queryFn: ({ signal }) => send<BotDetail>(`/bots/${botId}`, { signal }),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const readiness = useQuery({
    queryKey: [...readinessKey, bot.data?.revision],
    queryFn: async ({ signal }) =>
      releaseReadinessSchema.parse(
        await send<unknown>(`/bots/${botId}/releases/validate`, {
          method: 'POST',
          signal,
          body: JSON.stringify({ expectedRevision: bot.data!.revision }),
        }),
      ),
    enabled: !!bot.data && !bot.data.archivedAt && !bot.isFetching,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const list = useQuery({
    queryKey: [...listKey, kind, page],
    queryFn: async ({ signal }) =>
      releasePageSchema.parse(
        await send<unknown>(
          `/bots/${botId}/releases?${new URLSearchParams({ kind, page: String(page), pageSize: '10' })}`,
          { signal },
        ),
      ),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const id = selected ?? list.data?.items[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ['release', membership, id],
    queryFn: async ({ signal }) =>
      releaseDetailSchema.parse(await send<unknown>(`/releases/${id}`, { signal })),
    enabled: !!id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  async function recheck() {
    setRechecking(true);
    try {
      await bot.refetch();
      await client.invalidateQueries({ queryKey: readinessKey });
    } finally {
      setRechecking(false);
    }
  }
  function created(value: ReleaseDetail) {
    client.setQueryData(['release', membership, value.id], value);
    setKind('ALL');
    setPage(1);
    setSelected(value.id);
    setNotice(value.kind === 'PREVIEW' ? 'Preview saved.' : `Version ${value.version} saved.`);
    void client.invalidateQueries({ queryKey: listKey });
  }
  if (bot.isPending) return <p role="status">Loading releases…</p>;
  if (bot.isError)
    return (
      <section className="panel bot-empty">
        <h1>Releases unavailable</h1>
        <p role="alert">{errorMessage(bot.error)}</p>
        <Button onClick={() => void bot.refetch()}>Try again</Button>
      </section>
    );
  const canAuthor = ['OWNER', 'ADMINISTRATOR'].includes(identity.membership.role);
  const editable = canAuthor && !bot.data.archivedAt;
  return (
    <>
      <StudioLink href="/studio/bots" className="bot-back">
        <ArrowLeft size={15} aria-hidden="true" />
        All bots
      </StudioLink>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{bot.data.name}</p>
          <h1>Releases</h1>
          <p className="page-description">
            Keep a reliable version of your guide, in both languages.
          </p>
        </div>
      </div>
      <BotSections id={botId} active="releases" />
      {!canAuthor && (
        <p className="form-notice">
          You have view access. Owners and administrators can save previews and publish releases.
        </p>
      )}
      {bot.data.archivedAt ? (
        <p className="form-notice">
          This bot is archived. You can still inspect its saved releases.
        </p>
      ) : (
        <section className="release-readiness panel" aria-labelledby="release-readiness-title">
          <div className="release-section-heading">
            <div>
              <p className="eyebrow">Current draft · Revision {bot.data.revision}</p>
              <h2 id="release-readiness-title">Ready for its next version?</h2>
            </div>
            <Button variant="quiet" pending={rechecking} onClick={() => void recheck()}>
              Recheck draft
            </Button>
          </div>
          {readiness.isPending || readiness.isFetching || rechecking ? (
            <p role="status">Checking selected content…</p>
          ) : readiness.isError ? (
            <p role="alert">{errorMessage(readiness.error)}</p>
          ) : (
            <>
              <p className="release-readiness-summary">
                {readiness.data.canPublish ? (
                  <>
                    <CheckCircle2 size={17} aria-hidden="true" />
                    Both languages and selected content are ready to publish.
                  </>
                ) : (
                  `${readiness.data.issues.length} ${readiness.data.issues.length === 1 ? 'issue needs' : 'issues need'} attention before publication.`
                )}
              </p>
              {readiness.data.issues.length > 0 && (
                <ul className="release-issues">
                  {readiness.data.issues.map((issue, index) => {
                    const destination = issueDestination(botId, issue);
                    return (
                      <li key={`${issue.path}-${index}`}>
                        <div>
                          <p>{issue.message}</p>
                          <span className="small muted">
                            {issue.blocks === 'PUBLISH'
                              ? 'Publication only'
                              : 'Preview and publication'}{' '}
                            ·{' '}
                            {issue.path.endsWith('.ne')
                              ? 'Nepali'
                              : issue.path.endsWith('.en')
                                ? 'English'
                                : 'Selected content'}
                          </span>
                        </div>
                        <StudioLink href={destination.href}>{destination.label}</StudioLink>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="small muted">
                {readiness.data.providerMode === 'fixture'
                  ? 'Fixture demo · No external provider calls when saving or inspecting a release.'
                  : 'Saving and knowledge inspection do not call a voice or language provider.'}
              </p>
            </>
          )}
          {editable && (
            <ReleaseCapture
              bot={bot.data}
              readiness={readiness.isError ? undefined : readiness.data}
              disabled={rechecking || bot.isFetching || readiness.isFetching}
              onCreated={created}
            />
          )}
        </section>
      )}
      <p role="status" className="release-save-status">
        {notice}
      </p>
      <div className="release-layout">
        <section className="panel release-history" aria-labelledby="release-history-title">
          <h2 id="release-history-title">Version history</h2>
          <div className="select-field">
            <label htmlFor="release-kind">Show releases</label>
            <select
              id="release-kind"
              className="input"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as typeof kind);
                setPage(1);
                setSelected(null);
              }}
            >
              <option value="ALL">All releases</option>
              <option value="PUBLISHED">Published versions</option>
              <option value="PREVIEW">Staff previews</option>
            </select>
          </div>
          {list.isPending ? (
            <p role="status">Loading history…</p>
          ) : list.isError ? (
            <div>
              <p role="alert">{errorMessage(list.error)}</p>
              <Button onClick={() => void list.refetch()}>Retry history</Button>
            </div>
          ) : (
            <>
              {list.data.items.length === 0 ? (
                <p className="muted">No saved releases in this view.</p>
              ) : (
                <ol className="release-history-list">
                  {list.data.items.map((release) => (
                    <li key={release.id}>
                      <button
                        type="button"
                        className="release-history-item"
                        aria-pressed={id === release.id}
                        onClick={() => {
                          setSelected(release.id);
                          setNotice('');
                        }}
                      >
                        <span className="release-history-name">
                          <Layers size={16} aria-hidden="true" />
                          {release.kind === 'PREVIEW'
                            ? 'Staff preview'
                            : `Version ${release.version}`}
                        </span>
                        <time dateTime={release.createdAt}>
                          {new Date(release.createdAt).toLocaleString()}
                        </time>
                        <span>
                          Draft {release.botRevision} ·{' '}
                          {release.providerMode === 'fixture' ? 'Fixture' : 'Live'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="bot-pagination">
                <span className="small" role="status">
                  {list.data.total} saved · Page {page}
                </span>
                <div>
                  <Button
                    variant="quiet"
                    disabled={page === 1 || list.isFetching}
                    onClick={() => {
                      setPage(page - 1);
                      setSelected(null);
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={page * list.data.pageSize >= list.data.total || list.isFetching}
                    onClick={() => {
                      setPage(page + 1);
                      setSelected(null);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
        {!id ? (
          <section className="panel bot-empty">
            <Layers size={30} aria-hidden="true" />
            <h2>A fixed point for your guide</h2>
            <p>Select a saved release to inspect its identity, knowledge and presentation.</p>
          </section>
        ) : detail.isPending ? (
          <p role="status">Loading snapshot…</p>
        ) : detail.isError ? (
          <div className="panel bot-empty">
            <p role="alert">{errorMessage(detail.error)}</p>
            <Button onClick={() => void detail.refetch()}>Retry snapshot</Button>
          </div>
        ) : (
          <ReleaseInspector key={detail.data.id} release={detail.data} />
        )}
      </div>
    </>
  );
}
