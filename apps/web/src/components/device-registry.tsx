'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@base-ui/react/dialog';
import { KeyRound, Monitor, Plus, X } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { deviceCreateSchema } from '@svara/contracts';
import type { DeviceSummary, PairingChallenge } from '@svara/contracts';
import { errorMessage, staffResponse } from '../lib/staff-api';
import { formatZoned } from '../lib/zoned-time';
import { useStaffRequest, useStaffSession } from './session-provider';

const connectionTone = { ONLINE: 'success', OFFLINE: 'danger', NEVER_SEEN: 'neutral' } as const;
const connectionLabel = { ONLINE: 'Online', OFFLINE: 'Offline', NEVER_SEEN: 'Never connected' };

function useChange() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setPending(true);
    setError('');
    try {
      const result = await action();
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
      return result;
    } catch (failure) {
      setError(errorMessage(failure));
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, run };
}

function RegisterDevice() {
  const send = useStaffRequest();
  const [open, setOpen] = useState(false);
  const { pending, error, setError, run } = useChange();
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const parsed = deviceCreateSchema.safeParse({
      name: input.get('name'),
      capabilities: {
        microphone: input.get('microphone') === 'on',
        speaker: input.get('speaker') === 'on',
        secondaryDisplay: input.get('secondaryDisplay') === 'on',
      },
    });
    if (!parsed.success) {
      setError('Enter a device name up to 120 characters.');
      return;
    }
    if (
      await run(() =>
        send<DeviceSummary>('/devices', { method: 'POST', body: JSON.stringify(parsed.data) }),
      )
    )
      setOpen(false);
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
      <Dialog.Trigger className="button button--primary">
        <Plus size={17} aria-hidden="true" />
        Register device
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Close
            className="button button--quiet dialog-close"
            aria-label="Close register device"
            disabled={pending}
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
          <Dialog.Title className="dialog-title">Register a device</Dialog.Title>
          <Dialog.Description className="muted">
            Name the kiosk, then pair a browser to it with a one-time code.
          </Dialog.Description>
          <form className="staff-form" onSubmit={(event) => void create(event)}>
            {error && (
              <p className="form-notice form-notice--error" role="alert">
                {error}
              </p>
            )}
            <FormField
              label="Device name"
              name="name"
              required
              maxLength={120}
              disabled={pending}
            />
            <fieldset className="device-capabilities" disabled={pending}>
              <legend>Capabilities</legend>
              <label className="bot-checkbox">
                <input type="checkbox" name="microphone" defaultChecked /> Microphone
              </label>
              <label className="bot-checkbox">
                <input type="checkbox" name="speaker" defaultChecked /> Speaker
              </label>
              <label className="bot-checkbox">
                <input type="checkbox" name="secondaryDisplay" /> Second display
              </label>
            </fieldset>
            <Button type="submit" disabled={pending}>
              {pending ? 'Registering…' : 'Register'}
            </Button>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PairDevice({ device }: { device: DeviceSummary }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const [challenge, setChallenge] = useState<PairingChallenge | null>(null);
  const { pending, error, run } = useChange();
  async function start() {
    const created = await run(() =>
      send<PairingChallenge>(`/devices/${device.id}/pairing`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: device.revision }),
      }),
    );
    if (created) setChallenge(created);
  }
  return (
    <Dialog.Root
      open={!!challenge}
      onOpenChange={(value) => {
        if (!value) setChallenge(null);
      }}
    >
      <Button
        variant="secondary"
        disabled={pending || !device.enabled}
        onClick={() => void start()}
      >
        <KeyRound size={16} aria-hidden="true" />
        {device.paired ? 'Re-pair' : 'Pair'}
      </Button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Close className="button button--quiet dialog-close" aria-label="Close pairing">
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
          <Dialog.Title className="dialog-title">Pair {device.name}</Dialog.Title>
          <Dialog.Description className="muted">
            On the kiosk browser, open the kiosk link and enter this code. Pairing replaces any
            earlier pairing of this device, which is disconnected now.
          </Dialog.Description>
          {challenge && (
            <dl className="device-challenge">
              <dt>Code</dt>
              <dd className="device-code" aria-label="Pairing code">
                {challenge.code}
              </dd>
              <dt>Pairing ID</dt>
              <dd>
                <code>{challenge.id}</code>
              </dd>
              <dt>Kiosk link</dt>
              <dd>
                <a
                  href={`/kiosk?pairing=${challenge.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  /kiosk?pairing={challenge.id.slice(0, 8)}…
                </a>
              </dd>
              <dt>Expires</dt>
              <dd>
                {formatZoned(challenge.expiresAt, identity.organisation.timezone, {
                  timeStyle: 'short',
                })}
              </dd>
            </dl>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeviceRow({ device, canOperate }: { device: DeviceSummary; canOperate: boolean }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const { pending, error, run } = useChange();
  const [confirming, setConfirming] = useState(false);
  const save = (changes: Partial<Pick<DeviceSummary, 'enabled' | 'maintenanceMode'>>) =>
    run(() =>
      send<DeviceSummary>(`/devices/${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: device.name,
          capabilities: device.capabilities,
          enabled: device.enabled,
          maintenanceMode: device.maintenanceMode,
          ...changes,
          expectedRevision: device.revision,
        }),
      }),
    );
  return (
    <li className="schedule-item device-row">
      <div>
        <strong>
          <Monitor size={16} aria-hidden="true" /> {device.name}
        </strong>
        <span className="schedule-badges">
          <StatusBadge tone={connectionTone[device.connection]}>
            {connectionLabel[device.connection]}
          </StatusBadge>
          <StatusBadge tone={device.paired ? 'success' : 'neutral'}>
            {device.paired ? 'Paired' : 'Not paired'}
          </StatusBadge>
          {!device.enabled && <StatusBadge tone="danger">Disabled</StatusBadge>}
          {device.maintenanceMode && <StatusBadge tone="warning">Maintenance</StatusBadge>}
        </span>
        {device.lastSeenAt && (
          <span className="muted">
            Last seen {formatZoned(device.lastSeenAt, identity.organisation.timezone)}
          </span>
        )}
      </div>
      {canOperate && (
        <span className="schedule-cancel">
          <PairDevice device={device} />
          <Button
            variant="quiet"
            disabled={pending}
            onClick={() => void save({ maintenanceMode: !device.maintenanceMode })}
          >
            {device.maintenanceMode ? 'End maintenance' : 'Maintenance'}
          </Button>
          <Button
            variant="quiet"
            disabled={pending}
            onClick={() => void save({ enabled: !device.enabled })}
          >
            {device.enabled ? 'Disable' : 'Enable'}
          </Button>
          {device.paired &&
            (confirming ? (
              <>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    void run(() =>
                      send(`/devices/${device.id}/revoke`, {
                        method: 'POST',
                        body: JSON.stringify({ expectedRevision: device.revision }),
                      }),
                    ).then(() => setConfirming(false))
                  }
                >
                  Confirm revoke
                </Button>
                <Button variant="quiet" disabled={pending} onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button variant="quiet" onClick={() => setConfirming(true)}>
                Revoke
              </Button>
            ))}
          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
        </span>
      )}
    </li>
  );
}

export function DeviceRegistry() {
  const { identity } = useStaffSession();
  const canOperate = ['OWNER', 'ADMINISTRATOR', 'OPERATOR'].includes(identity.membership.role);
  const devices = useQuery({
    queryKey: ['devices', identity.membership.id],
    queryFn: async ({ signal }) =>
      (
        (await (await staffResponse('/devices?limit=100', { signal })).json()) as {
          data: DeviceSummary[];
        }
      ).data,
    // Presence comes from heartbeats; refresh it without a reload.
    refetchInterval: 10000,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KIOSKS AND THEIR SCREENS</p>
          <h1>Devices</h1>
          <p className="page-description">
            Register kiosks, pair a browser to each and revoke access at any time. Schedules live in
            Events &amp; Deployments.
          </p>
        </div>
        {canOperate && <RegisterDevice />}
      </div>
      <section className="panel schedule-events" aria-label="Device list">
        {devices.isPending ? (
          <p role="status">Loading devices…</p>
        ) : devices.isError ? (
          <p role="alert">{errorMessage(devices.error)}</p>
        ) : devices.data.length === 0 ? (
          <div className="bot-empty">
            <Monitor size={34} aria-hidden="true" />
            <h2>No devices yet</h2>
            <p>Register a kiosk, then pair a browser to it.</p>
          </div>
        ) : (
          <ul className="schedule-list">
            {devices.data.map((device) => (
              <DeviceRow key={device.id} device={device} canOperate={canOperate} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
