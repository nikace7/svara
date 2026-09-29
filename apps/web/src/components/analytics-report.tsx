'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '@svara/ui';
import { analyticsLatencySchema, analyticsOverviewSchema } from '@svara/contracts';
import type { LatencyDistribution, LatencyMetric, ProviderMode } from '@svara/contracts';
import { errorMessage, staffData } from '../lib/staff-api';
import { useStaffSession } from './session-provider';

const metricLabel: Record<LatencyMetric, string> = {
  sttMs: 'Speech recognised',
  firstTextMs: 'First answer text',
  firstAudioMs: 'First spoken audio',
  totalMs: 'Whole answer',
  slideAckMs: 'Kiosk showed a slide',
};
const actorLabel = { STAFF: 'Playground', DEVICE: 'Kiosks', VISITOR: 'Public links' } as const;
const stateLabel = {
  COMPLETED: 'Answered',
  INTERRUPTED: 'Stopped or superseded',
  FAILED: 'Failed',
  ANSWERING: 'Still answering',
} as const;
const humanise = (value: string) => value.toLowerCase().replaceAll('_', ' ');
const ms = (value: number | null) => (value === null ? '—' : `${value} ms`);

function Distribution({ row, minimum }: { row: LatencyDistribution; minimum: number }) {
  const note =
    row.samples === 0
      ? 'Unavailable: nothing measured'
      : row.samples < minimum
        ? `Insufficient: ${row.samples} of ${minimum} samples`
        : `${row.samples} samples`;
  return (
    <tr>
      <td>{metricLabel[row.metric]}</td>
      <td>{ms(row.p50)}</td>
      <td>{ms(row.p90)}</td>
      <td>{ms(row.p95)}</td>
      <td>{ms(row.max)}</td>
      <td>
        {note}
        {row.missing > 0 && ` · ${row.missing} not recorded`}
      </td>
    </tr>
  );
}

function Counts({ rows, empty }: { rows: [string, number][]; empty: string }) {
  const shown = rows.filter(([, count]) => count > 0);
  if (!shown.length) return <p className="muted">{empty}</p>;
  return (
    <dl className="analytics-counts">
      {shown.map(([label, count]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{count}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Recorded outcomes and measured timings. Live and demo are never combined, and a missing
 * measurement is shown as unavailable, never as zero. */
export function AnalyticsReport({ mode: serverMode }: { mode: ProviderMode }) {
  const { identity } = useStaffSession();
  const [mode, setMode] = useState<ProviderMode>(serverMode);
  const [locale, setLocale] = useState('');
  const [days, setDays] = useState('7');
  const query = `mode=${mode}&days=${days}${locale ? `&locale=${locale}` : ''}`;
  const key = [identity.membership.id, query];
  const overview = useQuery({
    queryKey: ['analytics-overview', ...key],
    queryFn: async ({ signal }) =>
      analyticsOverviewSchema.parse(
        await staffData<unknown>(`/analytics/overview?${query}`, { signal }),
      ),
  });
  const latency = useQuery({
    queryKey: ['analytics-latency', ...key],
    queryFn: async ({ signal }) =>
      analyticsLatencySchema.parse(
        await staffData<unknown>(`/analytics/latency?${query}`, { signal }),
      ),
  });
  const error = overview.error ?? latency.error;
  const counts = overview.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONVERSATIONS</p>
          <h1>Analytics</h1>
          <p className="page-description">
            What was recorded and measured. Nothing here is estimated or filled in.
          </p>
        </div>
        <StatusBadge tone={mode === 'live' ? 'success' : 'warning'}>
          {mode === 'live' ? 'Live results' : 'Demo results'}
        </StatusBadge>
      </div>
      <section className="panel analytics-filters" aria-label="Filters">
        <div className="field">
          <label htmlFor="analytics-mode">Results</label>
          <select
            id="analytics-mode"
            className="input"
            value={mode}
            onChange={(event) => setMode(event.target.value as ProviderMode)}
          >
            <option value="live">Live providers</option>
            <option value="fixture">Demo mode</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="analytics-locale">Language</label>
          <select
            id="analytics-locale"
            className="input"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            <option value="">Both</option>
            <option value="en-US">English</option>
            <option value="ne-NP">नेपाली</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="analytics-days">Period</label>
          <select
            id="analytics-days"
            className="input"
            value={days}
            onChange={(event) => setDays(event.target.value)}
          >
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </section>
      {error && (
        <p className="form-notice form-notice--error" role="alert">
          {errorMessage(error)}
        </p>
      )}
      <section className="panel analytics-panel" aria-labelledby="analytics-timing">
        <h2 id="analytics-timing">Response timing</h2>
        <p className="muted">
          Measured on the server from the moment a question arrives. Percentiles need at least{' '}
          {latency.data?.minimumSamples ?? 5} measurements.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Median</th>
                <th scope="col">90th</th>
                <th scope="col">95th</th>
                <th scope="col">Slowest</th>
                <th scope="col">Samples</th>
              </tr>
            </thead>
            <tbody>
              {latency.data?.metrics.map((row) => (
                <Distribution key={row.metric} row={row} minimum={latency.data.minimumSamples} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {counts && (
        <div className="analytics-grid">
          <section className="panel analytics-panel" aria-labelledby="analytics-sessions">
            <h2 id="analytics-sessions">Conversations · {counts.sessions.total}</h2>
            <Counts
              rows={Object.entries(counts.sessions.byActor).map(([actor, count]) => [
                actorLabel[actor as keyof typeof actorLabel],
                count,
              ])}
              empty="No conversations in this period."
            />
            <h3>How they ended</h3>
            <Counts
              rows={Object.entries(counts.sessions.byEndReason).map(([reason, count]) => [
                humanise(reason),
                count,
              ])}
              empty="None have ended yet."
            />
          </section>
          <section className="panel analytics-panel" aria-labelledby="analytics-questions">
            <h2 id="analytics-questions">
              Questions · {counts.turns.total}
              {counts.turns.voice > 0 && ` (${counts.turns.voice} spoken)`}
            </h2>
            <Counts
              rows={Object.entries(counts.turns.byState).map(([state, count]) => [
                stateLabel[state as keyof typeof stateLabel],
                count,
              ])}
              empty="No questions in this period."
            />
            <h3>Failures and stops</h3>
            <Counts
              rows={Object.entries(counts.turns.byFailure).map(([code, count]) => [
                humanise(code),
                count,
              ])}
              empty="No recorded failures."
            />
          </section>
          <section className="panel analytics-panel" aria-labelledby="analytics-tools">
            <h2 id="analytics-tools">Tool calls · {counts.tools.total}</h2>
            <Counts
              rows={Object.entries(counts.tools.byStatus).map(([status, count]) => [
                humanise(status),
                count,
              ])}
              empty="No tool calls in this period."
            />
          </section>
        </div>
      )}
    </>
  );
}
