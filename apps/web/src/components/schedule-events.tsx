'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { Dialog } from '@base-ui/react/dialog';
import { Plus, X } from 'lucide-react';
import { Button, FormField } from '@svara/ui';
import { eventCreateSchema } from '@svara/contracts';
import type { EventSummary } from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { formatZoned, fromZonedInput } from '../lib/zoned-time';
import { useStaffRequest, useStaffSession } from './session-provider';

function CreateEvent() {
  const send = useStaffRequest();
  const queryClient = useQueryClient();
  const { identity } = useStaffSession();
  const zone = identity.organisation.timezone;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const optional = (name: string) => {
      const value = String(input.get(name) ?? '');
      return value ? fromZonedInput(value, zone) : null;
    };
    const parsed = eventCreateSchema.safeParse({
      name: input.get('name'),
      venue: input.get('venue'),
      timezone: zone,
      suggestedStartsAt: optional('suggestedStartsAt'),
      suggestedEndsAt: optional('suggestedEndsAt'),
    });
    if (!parsed.success) {
      setError('Enter a name up to 120 characters, and a suggested end after the start.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await send('/events', { method: 'POST', body: JSON.stringify(parsed.data) });
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
      setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError('');
        }
      }}
    >
      <Dialog.Trigger className="button button--secondary">
        <Plus size={16} aria-hidden="true" />
        Add event
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Close
            className="button button--quiet dialog-close"
            aria-label="Close add event"
            disabled={pending}
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
          <Dialog.Title className="dialog-title">Add an event</Dialog.Title>
          <Dialog.Description className="muted">
            Events group deployments. Their suggested dates never move a deployment.
          </Dialog.Description>
          <form className="staff-form" onSubmit={(event) => void create(event)}>
            {error && (
              <p className="form-notice form-notice--error" role="alert">
                {error}
              </p>
            )}
            <FormField label="Event name" name="name" required maxLength={120} disabled={pending} />
            <FormField label="Venue" name="venue" maxLength={160} disabled={pending} />
            <div className="schedule-window">
              <FormField
                label="Suggested start"
                name="suggestedStartsAt"
                type="datetime-local"
                disabled={pending}
              />
              <FormField
                label="Suggested end"
                name="suggestedEndsAt"
                type="datetime-local"
                disabled={pending}
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Adding…' : 'Add event'}
            </Button>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ArchiveEvent({ event }: { event: EventSummary }) {
  const send = useStaffRequest();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function archive() {
    setPending(true);
    setError('');
    try {
      await send(`/events/${event.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archived: true, expectedRevision: event.revision }),
      });
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button variant="quiet" disabled={pending} onClick={() => void archive()}>
        {pending ? 'Archiving…' : 'Archive'}
        <span className="sr-only"> {event.name}</span>
      </Button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

export function ScheduleEvents({
  events,
  canOperate,
}: {
  events: UseQueryResult<{ items: EventSummary[] }>;
  canOperate: boolean;
}) {
  const { identity } = useStaffSession();
  const zone = identity.organisation.timezone;
  return (
    <section className="panel schedule-events" aria-labelledby="schedule-events-heading">
      <div className="schedule-device-heading">
        <div>
          <h2 id="schedule-events-heading">Events</h2>
          <p className="muted">Archived events keep their deployments but take no new ones.</p>
        </div>
        {canOperate && <CreateEvent />}
      </div>
      {events.isPending ? (
        <p role="status">Loading events…</p>
      ) : events.isError ? (
        <p role="alert">{errorMessage(events.error)}</p>
      ) : events.data.items.length === 0 ? (
        <p className="muted schedule-empty">No events yet.</p>
      ) : (
        <ul className="schedule-list">
          {events.data.items.map((item) => (
            <li key={item.id} className="schedule-item">
              <div>
                <strong>{item.name}</strong>
                <span className="muted">
                  {[
                    item.venue,
                    item.suggestedStartsAt && `from ${formatZoned(item.suggestedStartsAt, zone)}`,
                    `${item.deploymentCount} ${item.deploymentCount === 1 ? 'deployment' : 'deployments'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {canOperate && <ArchiveEvent event={item} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
