'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Monitor } from 'lucide-react';
import { Button, StatusBadge } from '@svara/ui';
import type {
  DeploymentSummary,
  DeviceTimeline,
  EventSummary,
  ScheduleBoard as Board,
} from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { formatZoned, startOfZonedDay } from '../lib/zoned-time';
import { useStaffRequest, useStaffSession } from './session-provider';
import { OverrideDevice, ScheduleDeployment } from './schedule-forms';
import { ScheduleEvents } from './schedule-events';

type Device = Board['devices'][number];
const day = 86_400_000;
const stateTone = {
  ACTIVE: 'success',
  UPCOMING: 'accent',
  ENDED: 'neutral',
  CANCELLED: 'neutral',
} as const;
const commandTone = {
  QUEUED: 'neutral',
  SENT: 'warning',
  ACKNOWLEDGED: 'success',
  FAILED: 'danger',
  EXPIRED: 'danger',
  SUPERSEDED: 'neutral',
} as const;

function CancelDeployment({ deployment }: { deployment: DeploymentSummary }) {
  const send = useStaffRequest();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function cancel() {
    setPending(true);
    setError('');
    try {
      await send(`/deployments/${deployment.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: deployment.revision }),
      });
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
    } catch (failure) {
      setError(errorMessage(failure));
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }
  const label = deployment.kind === 'OVERRIDE' ? 'End override' : 'Cancel';
  return (
    <span className="schedule-cancel">
      {confirming ? (
        <>
          <Button variant="destructive" disabled={pending} onClick={() => void cancel()}>
            {pending ? 'Working…' : `Confirm ${label.toLowerCase()}`}
          </Button>
          <Button variant="quiet" disabled={pending} onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </>
      ) : (
        <Button variant="quiet" onClick={() => setConfirming(true)}>
          {label}
        </Button>
      )}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

function Timeline({ deviceId }: { deviceId: string }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const timeline = useQuery({
    queryKey: ['schedule', 'timeline', deviceId],
    queryFn: ({ signal }) => send<DeviceTimeline>(`/devices/${deviceId}/timeline`, { signal }),
    refetchInterval: 5000,
  });
  if (timeline.isPending) return <p role="status">Loading delivery history…</p>;
  if (timeline.isError) return <p role="alert">{errorMessage(timeline.error)}</p>;
  if (!timeline.data.commands.length)
    return <p className="muted">No commands yet. One is queued whenever desired state changes.</p>;
  return (
    <ol className="schedule-timeline">
      {timeline.data.commands.map((command) => (
        <li key={command.id}>
          <StatusBadge tone={commandTone[command.status]}>
            {command.status.toLowerCase()}
          </StatusBadge>
          <span>
            Revision {command.stateRevision} · {command.releaseId ? 'apply release' : 'go idle'} ·{' '}
            {command.attempts === 1 ? '1 delivery' : `${command.attempts} deliveries`}
          </span>
          <time dateTime={command.createdAt}>
            {formatZoned(command.createdAt, identity.organisation.timezone)}
          </time>
          {command.reason && <code>{command.reason}</code>}
        </li>
      ))}
    </ol>
  );
}

function DeviceSchedule({
  device,
  board,
  canOperate,
}: {
  device: Device;
  board: Board;
  canOperate: boolean;
}) {
  const { identity } = useStaffSession();
  const zone = identity.organisation.timezone;
  const [history, setHistory] = useState(false);
  const rows = board.deployments.filter((item) => item.deviceId === device.id);
  const governing = board.deployments.find((item) => item.id === device.desired.deploymentId);
  const { desired } = device;
  const headingId = `device-${device.id}`;
  return (
    <section className="panel schedule-device" aria-labelledby={headingId}>
      <div className="schedule-device-heading">
        <div>
          <h2 id={headingId}>
            <Monitor size={18} aria-hidden="true" />
            {device.name}
          </h2>
          <p className="schedule-state">
            <span>
              Now:{' '}
              {desired.releaseId
                ? governing
                  ? `${governing.release.botName} v${governing.release.version}${governing.kind === 'OVERRIDE' ? ' (override)' : ''}`
                  : 'A scheduled release'
                : 'Idle'}
            </span>
            {desired.revision === 0 ? null : desired.appliedRevision === desired.revision ? (
              <StatusBadge tone="success">Applied on device</StatusBadge>
            ) : (
              <StatusBadge tone="warning">
                Waiting for device · revision {desired.revision}
              </StatusBadge>
            )}
            {!device.enabled && <StatusBadge tone="danger">Disabled</StatusBadge>}
          </p>
        </div>
        {canOperate && <OverrideDevice device={device} board={board} />}
      </div>
      {rows.length ? (
        <ol className="schedule-list">
          {rows.map((item) => (
            <li key={item.id} className="schedule-item">
              <div>
                <strong>
                  {item.release.botName} v{item.release.version}
                </strong>
                <span className="muted">
                  <time dateTime={item.startsAt}>{formatZoned(item.startsAt, zone)}</time> –{' '}
                  <time dateTime={item.endsAt}>{formatZoned(item.endsAt, zone)}</time>
                  {item.event && ` · ${item.event.name}`}
                </span>
              </div>
              <span className="schedule-badges">
                {item.kind === 'OVERRIDE' && <StatusBadge tone="warning">Override</StatusBadge>}
                <StatusBadge tone={stateTone[item.state]}>{item.state.toLowerCase()}</StatusBadge>
              </span>
              {canOperate && (item.state === 'ACTIVE' || item.state === 'UPCOMING') && (
                <CancelDeployment deployment={item} />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted schedule-empty">Nothing scheduled this week. The device is idle.</p>
      )}
      <details onToggle={(event) => setHistory(event.currentTarget.open)}>
        <summary>Delivery history</summary>
        {history && <Timeline deviceId={device.id} />}
      </details>
    </section>
  );
}

export function ScheduleBoard() {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const zone = identity.organisation.timezone;
  const canOperate = ['OWNER', 'ADMINISTRATOR', 'OPERATOR'].includes(identity.membership.role);
  const [week, setWeek] = useState(0);
  // ponytail: a week is seven 24-hour days; zones with daylight saving drift by an hour at the edge.
  const from = useMemo(
    () => new Date(startOfZonedDay(new Date(), zone).getTime() + week * 7 * day),
    [week, zone],
  );
  const to = new Date(from.getTime() + 7 * day);
  const board = useQuery({
    queryKey: ['schedule', identity.membership.id, from.toISOString()],
    queryFn: ({ signal }) =>
      send<Board>(
        `/deployments?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`,
        { signal },
      ),
    // The worker moves devices between releases at boundary times; keep the board current.
    refetchInterval: 5000,
  });
  const events = useQuery({
    queryKey: ['schedule', 'events', identity.membership.id],
    queryFn: ({ signal }) => send<{ items: EventSummary[] }>('/events', { signal }),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WHAT EACH DEVICE RUNS, AND WHEN</p>
          <h1>Events &amp; Deployments</h1>
          <p className="page-description">
            Schedule published releases on devices. Times are shown in {zone}.
          </p>
        </div>
        {canOperate && board.data && (
          <ScheduleDeployment board={board.data} events={events.data?.items ?? []} />
        )}
      </div>
      {!canOperate && (
        <p className="form-notice">
          You have view access. An owner, administrator or operator can change schedules.
        </p>
      )}
      <div className="schedule-week" role="group" aria-label="Week">
        <Button variant="secondary" onClick={() => setWeek(week - 1)} aria-label="Previous week">
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <p>
          <CalendarDays size={16} aria-hidden="true" />
          {formatZoned(from.toISOString(), zone, { dateStyle: 'medium' })} –{' '}
          {formatZoned(new Date(to.getTime() - 1).toISOString(), zone, { dateStyle: 'medium' })}
        </p>
        <Button variant="secondary" onClick={() => setWeek(week + 1)} aria-label="Next week">
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
        {week !== 0 && (
          <Button variant="quiet" onClick={() => setWeek(0)}>
            This week
          </Button>
        )}
      </div>
      {board.isPending ? (
        <p role="status" className="bot-empty">
          Loading schedules…
        </p>
      ) : board.isError ? (
        <div className="bot-empty">
          <p role="alert">{errorMessage(board.error)}</p>
          <Button variant="secondary" onClick={() => void board.refetch()}>
            Try again
          </Button>
        </div>
      ) : board.data.devices.length === 0 ? (
        <div className="panel bot-empty">
          <Monitor size={34} aria-hidden="true" />
          <h2>No devices yet</h2>
          <p>Register and pair a kiosk first; its schedule appears here.</p>
        </div>
      ) : (
        <div className="schedule-devices">
          {board.data.devices.map((device) => (
            <DeviceSchedule
              key={device.id}
              device={device}
              board={board.data}
              canOperate={canOperate}
            />
          ))}
        </div>
      )}
      <ScheduleEvents events={events} canOperate={canOperate} />
    </>
  );
}
