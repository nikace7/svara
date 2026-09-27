'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@base-ui/react/dialog';
import { CalendarPlus, Zap, X } from 'lucide-react';
import { Button, FormField } from '@svara/ui';
import { SCHEDULE_LIMITS } from '@svara/contracts';
import type {
  BotPage,
  DeploymentSummary,
  EventSummary,
  ReleasePage,
  ScheduleBoard,
} from '@svara/contracts';
import { StaffApiError, errorMessage } from '../lib/staff-api';
import { formatZoned, fromZonedInput, toZonedInput } from '../lib/zoned-time';
import { useStaffRequest, useStaffSession } from './session-provider';

type Device = ScheduleBoard['devices'][number];

/** Published releases only: previews stay in the studio and can never be scheduled. */
function ReleasePicker({ disabled }: { disabled: boolean }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const [botId, setBotId] = useState('');
  const bots = useQuery({
    queryKey: ['bots', identity.membership.id, 'schedule'],
    queryFn: ({ signal }) => send<BotPage>('/bots?page=1&pageSize=50', { signal }),
  });
  const chosen = botId || bots.data?.items[0]?.id || '';
  const releases = useQuery({
    queryKey: ['releases', identity.membership.id, chosen, 'published'],
    queryFn: ({ signal }) =>
      send<ReleasePage>(`/bots/${chosen}/releases?kind=PUBLISHED&page=1&pageSize=50`, { signal }),
    enabled: !!chosen,
  });
  const published =
    releases.data?.items.flatMap((item) => (item.kind === 'PUBLISHED' ? [item] : [])) ?? [];
  return (
    <>
      <div className="field">
        <label htmlFor="schedule-bot">Bot</label>
        <select
          id="schedule-bot"
          className="input"
          value={chosen}
          disabled={disabled || !bots.data?.items.length}
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
        <label htmlFor="schedule-release">Published release</label>
        <select
          id="schedule-release"
          name="releaseId"
          className="input"
          required
          disabled={disabled || !published.length}
        >
          {published.map((release) => (
            <option key={release.id} value={release.id}>
              Version {release.version}
            </option>
          ))}
        </select>
        {!releases.isPending && !published.length && (
          <p className="field-help">Publish this bot before scheduling it.</p>
        )}
      </div>
    </>
  );
}

function FormDialog({
  trigger,
  title,
  description,
  pending,
  onOpenChange,
  open,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  pending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      {trigger}
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Close
            className="button button--quiet dialog-close"
            aria-label={`Close ${title.toLowerCase()}`}
            disabled={pending}
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description className="muted">{description}</Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function useSubmit(onDone: () => void) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<StaffApiError | string>('');
  async function submit(run: () => Promise<unknown>) {
    setPending(true);
    setError('');
    try {
      await run();
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
      onDone();
    } catch (failure) {
      setError(failure instanceof StaffApiError ? failure : errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, submit };
}

function FormError({ error, board }: { error: StaffApiError | string; board: ScheduleBoard }) {
  const { identity } = useStaffSession();
  if (!error) return null;
  const blocking = typeof error === 'string' ? [] : error.conflictIds;
  return (
    <div className="form-notice form-notice--error" role="alert">
      <p>{typeof error === 'string' ? error : error.message}</p>
      {blocking.length > 0 && (
        <ul className="schedule-conflicts">
          {blocking.map((id) => {
            const found = board.deployments.find((item) => item.id === id);
            return (
              <li key={id}>
                {found
                  ? `${found.release.botName} v${found.release.version}: ${formatZoned(found.startsAt, identity.organisation.timezone)} – ${formatZoned(found.endsAt, identity.organisation.timezone)}`
                  : 'A deployment outside this week'}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function nextQuarterHour(): Date {
  const step = 15 * 60_000;
  return new Date(Math.ceil(Date.now() / step) * step);
}

export function ScheduleDeployment({
  board,
  events,
}: {
  board: ScheduleBoard;
  events: EventSummary[];
}) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const zone = identity.organisation.timezone;
  const [open, setOpen] = useState(false);
  const { pending, error, setError, submit } = useSubmit(() => setOpen(false));
  const start = nextQuarterHour();
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const startsAt = fromZonedInput(String(input.get('startsAt')), zone);
    const endsAt = fromZonedInput(String(input.get('endsAt')), zone);
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError('Choose an end time after the start time.');
      return;
    }
    void submit(() =>
      send<DeploymentSummary>('/deployments', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: input.get('deviceId'),
          releaseId: input.get('releaseId'),
          eventId: input.get('eventId') || null,
          startsAt,
          endsAt,
        }),
      }),
    );
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setError('');
      }}
      pending={pending}
      title="Schedule a deployment"
      description={`Times are in ${zone}. A device runs one scheduled release at a time; overrides win while they last.`}
      trigger={
        <Dialog.Trigger className="button button--primary" disabled={!board.devices.length}>
          <CalendarPlus size={17} aria-hidden="true" />
          Schedule deployment
        </Dialog.Trigger>
      }
    >
      <form className="staff-form" onSubmit={create}>
        <FormError error={error} board={board} />
        <div className="field">
          <label htmlFor="schedule-device">Device</label>
          <select id="schedule-device" name="deviceId" className="input" disabled={pending}>
            {board.devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </div>
        <ReleasePicker disabled={pending} />
        <div className="field">
          <label htmlFor="schedule-event">Event</label>
          <select id="schedule-event" name="eventId" className="input" disabled={pending}>
            <option value="">No event</option>
            {events.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="schedule-window">
          <FormField
            label="Starts"
            name="startsAt"
            type="datetime-local"
            required
            disabled={pending}
            defaultValue={toZonedInput(start.toISOString(), zone)}
          />
          <FormField
            label="Ends"
            name="endsAt"
            type="datetime-local"
            required
            disabled={pending}
            defaultValue={toZonedInput(
              new Date(start.getTime() + 2 * 3_600_000).toISOString(),
              zone,
            )}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Scheduling…' : 'Schedule'}
        </Button>
      </form>
    </FormDialog>
  );
}

export function OverrideDevice({ device, board }: { device: Device; board: ScheduleBoard }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const [open, setOpen] = useState(false);
  const { pending, error, setError, submit } = useSubmit(() => setOpen(false));
  const running = board.deployments.find(
    (item) => item.deviceId === device.id && item.kind === 'OVERRIDE' && item.state === 'ACTIVE',
  );
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    void submit(() =>
      send<DeploymentSummary>(`/devices/${device.id}/override`, {
        method: 'POST',
        body: JSON.stringify({
          releaseId: input.get('releaseId'),
          minutes: Number(input.get('minutes')),
          replaceOverrideId: running && input.get('replace') ? running.id : null,
        }),
      }),
    );
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setError('');
      }}
      pending={pending}
      title={`Override ${device.name}`}
      description="Starts now and wins over any schedule until it ends. The device returns to its schedule afterwards."
      trigger={
        <Dialog.Trigger className="button button--secondary">
          <Zap size={16} aria-hidden="true" />
          Override now
        </Dialog.Trigger>
      }
    >
      <form className="staff-form" onSubmit={create}>
        <FormError error={error} board={board} />
        <ReleasePicker disabled={pending} />
        <FormField
          label="Minutes"
          name="minutes"
          type="number"
          min={1}
          max={SCHEDULE_LIMITS.overrideMaxMinutes}
          defaultValue={SCHEDULE_LIMITS.overrideDefaultMinutes}
          required
          disabled={pending}
          help="Up to 24 hours."
        />
        {running && (
          <label className="bot-checkbox">
            <input type="checkbox" name="replace" required disabled={pending} />
            Replace the active override ({running.release.botName} v{running.release.version}, until{' '}
            {formatZoned(running.endsAt, identity.organisation.timezone, { timeStyle: 'short' })})
          </label>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Starting…' : 'Start override'}
        </Button>
      </form>
    </FormDialog>
  );
}
