'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, StatusBadge } from '@svara/ui';
import { sessionDetailSchema, sessionSummarySchema } from '@svara/contracts';
import type { SessionDetail, SessionSummary } from '@svara/contracts';
import { z } from 'zod';
import { errorMessage, staffResponse } from '../lib/staff-api';
import { formatZoned } from '../lib/zoned-time';
import { useStaffRequest, useStaffSession } from './session-provider';

const pageSchema = z.object({
  data: z.array(sessionSummarySchema),
  page: z.object({ nextCursor: z.string().nullable() }),
});
const actorLabel = { STAFF: 'Playground', DEVICE: 'Kiosk', VISITOR: 'Public link' } as const;
const where = (session: SessionSummary) =>
  session.deviceName ?? session.linkLabel ?? actorLabel[session.actorKind];
const status = (session: SessionSummary) =>
  session.status === 'ACTIVE'
    ? 'Active'
    : `Ended${session.endReason ? ` · ${session.endReason.toLowerCase().replaceAll('_', ' ')}` : ''}`;
const ms = (value: number | null) => (value === null ? 'unavailable' : `${value} ms`);
/** What the kiosk did with a slide command, including a late acknowledgement. */
const kiosk: Record<string, string> = {
  'ACKNOWLEDGED:APPLIED': 'kiosk applied it',
  'FAILED:REJECTED': 'kiosk rejected it',
  SENT: 'awaiting the kiosk',
  EXPIRED: 'kiosk never acknowledged',
  SUPERSEDED: 'replaced by a newer release',
};

/** Recent conversations, newest first; each links to its full record. */
export function SessionList() {
  const { identity } = useStaffSession();
  const timeZone = identity.organisation.timezone;
  const [cursor, setCursor] = useState<string | null>(null);
  const page = useQuery({
    queryKey: ['sessions', identity.membership.id, cursor],
    queryFn: async ({ signal }) =>
      pageSchema.parse(
        await (
          await staffResponse(`/sessions?limit=50${cursor ? `&cursor=${cursor}` : ''}`, { signal })
        ).json(),
      ),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONVERSATIONS</p>
          <h1>Sessions</h1>
          <p className="page-description">
            Every playground, kiosk and public-link conversation, with what was heard and done.
          </p>
        </div>
        <Link href="/studio/playground" className="button button--primary">
          Open playground
        </Link>
      </div>
      <section className="panel">
        {page.isError && (
          <p className="form-notice form-notice--error" role="alert">
            {errorMessage(page.error)}
          </p>
        )}
        {page.data && !page.data.data.length ? (
          <p className="muted table-empty">
            No conversations yet. Ask something in the playground or on a paired kiosk.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Release</th>
                  <th scope="col">Where</th>
                  <th scope="col">Language</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Questions</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {page.data?.data.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <Link href={`/studio/sessions/${session.id}`}>
                        {formatZoned(session.startedAt, timeZone)}
                      </Link>
                    </td>
                    <td>
                      {session.botName}
                      {session.releaseVersion ? ` · v${session.releaseVersion}` : ' · preview'}
                    </td>
                    <td>{where(session)}</td>
                    <td>{session.locale === 'ne-NP' ? 'नेपाली' : 'English'}</td>
                    <td>{session.providerMode === 'live' ? 'Live' : 'Demo'}</td>
                    <td>{session.turns}</td>
                    <td>{status(session)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page.data?.page.nextCursor && (
          <div className="panel-footer">
            <Button variant="secondary" onClick={() => setCursor(page.data.page.nextCursor)}>
              Older sessions
            </Button>
          </div>
        )}
      </section>
    </>
  );
}

/** One conversation: each question, its answer and provenance, tool outcomes and timings. */
export function SessionRecord({ id }: { id: string }) {
  const { identity } = useStaffSession();
  const send = useStaffRequest();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const canDelete = ['OWNER', 'ADMINISTRATOR'].includes(identity.membership.role);
  const detail = useQuery({
    queryKey: ['session', identity.membership.id, id],
    queryFn: async ({ signal }) =>
      sessionDetailSchema.parse(await send<unknown>(`/sessions/${id}`, { signal })),
  });
  async function remove() {
    setError('');
    try {
      const updated: SessionDetail = sessionDetailSchema.parse(
        await send<unknown>(`/sessions/${id}`, { method: 'DELETE', body: '{}' }),
      );
      queryClient.setQueryData(['session', identity.membership.id, id], updated);
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setConfirming(false);
      router.refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  if (detail.isError)
    return (
      <p className="form-notice form-notice--error" role="alert">
        {errorMessage(detail.error)}
      </p>
    );
  const session = detail.data;
  if (!session) return <p role="status">Loading session…</p>;
  return (
    <>
      <Link href="/studio/sessions" className="back-link">
        ← All sessions
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {actorLabel[session.actorKind].toUpperCase()} · {where(session)}
          </p>
          <h1>
            {session.botName}
            {session.releaseVersion ? ` v${session.releaseVersion}` : ' preview'}
          </h1>
          <p className="page-description">
            Started {formatZoned(session.startedAt, identity.organisation.timezone)} ·{' '}
            {status(session)}
          </p>
        </div>
        <StatusBadge tone={session.providerMode === 'live' ? 'success' : 'warning'}>
          {session.providerMode === 'live' ? 'Live' : 'Demo mode'}
        </StatusBadge>
      </div>
      {error && (
        <p className="form-notice form-notice--error" role="alert">
          {error}
        </p>
      )}
      <section className="panel" aria-label="Transcript">
        {session.transcriptDeleted && (
          <p className="form-notice">The transcript was deleted. Outcomes and timings remain.</p>
        )}
        {!session.turnList.length && <p className="muted table-empty">No questions were asked.</p>}
        {session.turnList.map((turn) => (
          <article
            key={turn.id}
            className="session-turn"
            lang={turn.locale === 'ne-NP' ? 'ne' : 'en'}
          >
            <p>
              <span className="eyebrow">
                QUESTION {turn.ordinal} · {turn.inputKind === 'VOICE' ? 'spoken' : 'typed'}
              </span>
              <br />
              {turn.question || <span className="muted">(removed)</span>}
            </p>
            <p>
              <span className="eyebrow">
                ANSWER · {turn.state.toLowerCase()}
                {turn.failureCode ? ` · ${turn.failureCode}` : ''}
              </span>
              <br />
              {turn.answer || <span className="muted">(none)</span>}
            </p>
            {turn.citedEntryIds.length > 0 && (
              <p className="muted">
                Cited {turn.citedEntryIds.length} approved entr
                {turn.citedEntryIds.length === 1 ? 'y' : 'ies'}.
              </p>
            )}
            {turn.tools.map((tool) => (
              <p key={tool.id} className="muted">
                Tool {tool.name}: {tool.status}
                {tool.reason ? ` (${tool.reason})` : ''}
                {tool.commandStatus
                  ? ` · ${kiosk[tool.commandStatus] ?? tool.commandStatus.toLowerCase()}`
                  : ''}
              </p>
            ))}
            <dl>
              <div>
                <dt>Recognition</dt>
                <dd>{turn.inputKind === 'TEXT' ? 'not spoken' : ms(turn.timings.sttMs)}</dd>
              </div>
              <div>
                <dt>First text</dt>
                <dd>{ms(turn.timings.firstTextMs)}</dd>
              </div>
              <div>
                <dt>First audio</dt>
                <dd>{ms(turn.timings.firstAudioMs)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{ms(turn.timings.totalMs)}</dd>
              </div>
            </dl>
          </article>
        ))}
        {canDelete && !session.transcriptDeleted && (
          <div className="panel-footer">
            {confirming ? (
              <>
                <span>Remove every question, answer and tool payload? This cannot be undone.</span>
                <Button variant="destructive" onClick={() => void remove()}>
                  Confirm delete
                </Button>
                <Button variant="quiet" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => setConfirming(true)}>
                Delete transcript
              </Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
