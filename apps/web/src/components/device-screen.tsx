'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { FormEvent } from 'react';
import type { Socket } from 'socket.io-client';
import { AudioLines, MonitorUp } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { DEVICE_EVENTS } from '@svara/contracts';
import type { DesiredEvent, DisplayState } from '@svara/contracts';
import {
  DeviceRuntimeError,
  connectDevice,
  deviceIdentity,
  loadManifest,
  meta,
  pairDevice,
  prepareRelease,
} from '../lib/device-runtime';
import type { DeviceIdentity, DeviceRole, PreparedRelease } from '../lib/device-runtime';

type Connection = 'connecting' | 'online' | 'offline';
type Activity = { kind: 'ready' | 'downloading' } | { kind: 'error'; message: string };
const reasonOf = (error: unknown) =>
  error instanceof DeviceRuntimeError ? error.code : 'DOWNLOAD_FAILED';

function PairForm({ onPaired }: { onPaired: (identity: DeviceIdentity) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  // Only rendered in the browser (after the identity check), so the URL is available.
  const [challengeId] = useState(
    () => new URLSearchParams(window.location.search).get('pairing') ?? '',
  );
  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      // Only shown when this profile has no working pairing, so replacing a dead cookie is safe.
      onPaired(
        await pairDevice({
          challengeId: String(input.get('challengeId')).trim(),
          code: String(input.get('code')).trim(),
          replaceExisting: true,
        }),
      );
    } catch (failure) {
      setError(
        failure instanceof DeviceRuntimeError
          ? failure.message
          : 'The device service is unavailable. Try again shortly.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="staff-form device-pair" onSubmit={(event) => void pair(event)}>
      <h1>Pair this kiosk</h1>
      <p className="muted">
        In the studio, open Devices and choose Pair. Enter the pairing ID and six-character code it
        shows. Codes expire after five minutes.
      </p>
      {error && (
        <p className="form-notice form-notice--error" role="alert">
          {error}
        </p>
      )}
      <FormField
        label="Pairing ID"
        name="challengeId"
        required
        defaultValue={challengeId}
        disabled={pending}
        autoComplete="off"
      />
      <FormField
        label="Pairing code"
        name="code"
        required
        maxLength={6}
        disabled={pending}
        autoComplete="one-time-code"
        className="device-code"
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Pairing…' : 'Pair kiosk'}
      </Button>
    </form>
  );
}

function Slides({
  prepared,
  role,
  locale,
}: {
  prepared: PreparedRelease;
  role: DeviceRole;
  locale: 'en' | 'ne';
}) {
  const target = role === 'PRIMARY' ? 'PRIMARY' : 'SECONDARY';
  const slides = prepared.release.slides.filter(
    (slide) => slide.target === target || slide.target === 'BOTH',
  );
  const [index, setIndex] = useState(0);
  const slide = slides[index % Math.max(slides.length, 1)];
  useEffect(() => {
    if (slides.length < 2 || !slide) return;
    const timer = setTimeout(() => setIndex((value) => value + 1), slide.durationSeconds * 1000);
    return () => clearTimeout(timer);
  }, [slide, slides.length]);
  if (!slide)
    return role === 'DISPLAY' ? (
      <p className="muted">This release has no slides for the second screen.</p>
    ) : null;
  const asset = prepared.release.media.find((item) => item.id === slide.mediaId);
  const url = slide.mediaId ? prepared.urls[slide.mediaId] : undefined;
  return (
    <figure className="device-slide" aria-label={`Slide ${(index % slides.length) + 1}`}>
      {url &&
        (asset?.mimeType === 'video/mp4' ? (
          <video src={url} muted autoPlay loop playsInline />
        ) : (
          <Image
            src={url}
            alt=""
            width={asset?.width ?? 1}
            height={asset?.height ?? 1}
            unoptimized
          />
        ))}
      <figcaption lang={locale === 'ne' ? 'ne' : 'en'}>
        {slide.title[locale] && <strong>{slide.title[locale]}</strong>}
        {slide.body[locale] && <span>{slide.body[locale]}</span>}
      </figcaption>
    </figure>
  );
}

/** One paired window: the primary kiosk applies releases, a display mirrors what it applied. */
export function DeviceScreen({ role }: { role: DeviceRole }) {
  const [identity, setIdentity] = useState<DeviceIdentity | null | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState<Connection>('connecting');
  const [activity, setActivity] = useState<Activity>({ kind: 'ready' });
  const [shown, setShown] = useState<PreparedRelease | null>(null);
  const [revision, setRevision] = useState(0);
  const [locale, setLocale] = useState<'en' | 'ne'>('en');
  const [popupBlocked, setPopupBlocked] = useState(false);
  const current = useRef<PreparedRelease | null>(null);
  const applied = useRef<{ commandId: string | null; revision: number }>({
    commandId: null,
    revision: 0,
  });
  const pending = useRef<{ value: DesiredEvent | DisplayState; socket: Socket } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    deviceIdentity().then(setIdentity, () => {
      setIdentity(null);
      setNotice('The device service is unavailable. Reload to try again.');
    });
  }, []);

  /** Swaps in a complete release at once; the previous one stays until this moment. */
  function swap(next: PreparedRelease | null) {
    const old = current.current;
    current.current = next;
    setShown(next);
    if (old && old !== next) for (const url of Object.values(old.urls)) URL.revokeObjectURL(url);
  }
  function ack(
    socket: Socket,
    commandId: string,
    appliedRevision: number,
    result: 'APPLIED' | 'REJECTED',
    reason: string | null = null,
  ) {
    socket.emit(DEVICE_EVENTS.ack, { ...meta(), commandId, appliedRevision, result, reason });
  }

  async function applyDesired(event: DesiredEvent, socket: Socket) {
    if (event.commandId && event.commandId === applied.current.commandId) {
      // A repeated delivery: acknowledge again; the server returns the stored outcome.
      ack(socket, event.commandId, event.revision, 'APPLIED');
      return;
    }
    if (!event.releaseId) {
      swap(null);
      applied.current = { commandId: event.commandId, revision: event.revision };
      setRevision(event.revision);
      if (event.commandId) ack(socket, event.commandId, event.revision, 'APPLIED');
      return;
    }
    setActivity({ kind: 'downloading' });
    try {
      const manifest = await loadManifest('desired');
      if (!manifest.release || !manifest.commandId)
        throw new DeviceRuntimeError('DOWNLOAD_FAILED', 'The release is no longer desired.');
      const prepared = await prepareRelease(manifest.release, 'PRIMARY');
      swap(prepared);
      applied.current = { commandId: manifest.commandId, revision: manifest.revision };
      setRevision(manifest.revision);
      setActivity({ kind: 'ready' });
      ack(socket, manifest.commandId, manifest.revision, 'APPLIED');
    } catch (error) {
      const reason = reasonOf(error);
      const still = current.current
        ? `Still showing ${current.current.release.botName} v${current.current.release.version}.`
        : 'Nothing was shown before it.';
      setActivity({
        kind: 'error',
        message: `Update to revision ${event.revision} failed (${reason}). ${still}`,
      });
      if (event.commandId) ack(socket, event.commandId, event.revision, 'REJECTED', reason);
    }
  }

  async function mirror(state: DisplayState) {
    if (!state.releaseId) {
      swap(null);
      setRevision(state.revision);
      return;
    }
    setActivity({ kind: 'downloading' });
    try {
      const manifest = await loadManifest('applied');
      if (!manifest.release) throw new DeviceRuntimeError('DOWNLOAD_FAILED', 'Nothing applied.');
      swap(await prepareRelease(manifest.release, 'DISPLAY'));
      setRevision(manifest.revision);
      setActivity({ kind: 'ready' });
    } catch (error) {
      setActivity({ kind: 'error', message: `Display update failed (${reasonOf(error)}).` });
    }
  }

  /** Latest instruction wins; one download runs at a time. */
  async function drain() {
    if (busy.current) return;
    busy.current = true;
    try {
      while (pending.current) {
        const { value, socket } = pending.current;
        pending.current = null;
        if (role === 'PRIMARY') await applyDesired(value as DesiredEvent, socket);
        else await mirror(value as DisplayState);
      }
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    if (!identity) return;
    return connectDevice(role, identity.csrfToken, {
      online: () => setConnection('online'),
      offline: () => setConnection('offline'),
      revoked: () => {
        // A revoked pairing clears everything this window downloaded.
        swap(null);
        applied.current = { commandId: null, revision: 0 };
        setIdentity(null);
        setNotice('This kiosk was unpaired or disabled by staff.');
      },
      event: (name, value, socket) => {
        if (name === DEVICE_EVENTS.desired || name === DEVICE_EVENTS.display) {
          pending.current = { value: value as DesiredEvent, socket };
          void drain();
        }
      },
    });
    // The connection depends only on the paired identity and this window's role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, role]);

  if (identity === undefined)
    return (
      <main className="device-screen device-screen--center">
        <p role="status">Starting…</p>
      </main>
    );
  if (!identity)
    return (
      <main className="device-screen device-screen--center">
        {notice && (
          <p className="form-notice" role="status">
            {notice}
          </p>
        )}
        {role === 'PRIMARY' ? (
          <PairForm
            onPaired={(value) => {
              setNotice('');
              setConnection('connecting');
              setIdentity(value);
            }}
          />
        ) : (
          <p>Pair the kiosk window first, then open its display from there.</p>
        )}
      </main>
    );

  const release = shown?.release;
  return (
    <div className={`device-screen device-screen--${role.toLowerCase()}`}>
      <header className="device-bar" aria-label="Device status">
        <strong>
          <AudioLines size={18} aria-hidden="true" /> {identity.device.name}
          {role === 'DISPLAY' && ' · display'}
        </strong>
        <span className="device-bar-status">
          <StatusBadge
            tone={
              connection === 'online' ? 'success' : connection === 'offline' ? 'danger' : 'neutral'
            }
          >
            {connection === 'online'
              ? 'Online'
              : connection === 'offline'
                ? 'Offline'
                : 'Connecting'}
          </StatusBadge>
          {activity.kind === 'downloading' && <StatusBadge tone="accent">Downloading</StatusBadge>}
          {identity.device.maintenanceMode && <StatusBadge tone="warning">Maintenance</StatusBadge>}
          <span className="muted">Revision {revision}</span>
          <Button
            variant="quiet"
            onClick={() => setLocale(locale === 'en' ? 'ne' : 'en')}
            aria-label={locale === 'en' ? 'Show Nepali' : 'Show English'}
          >
            {locale === 'en' ? 'नेपाली' : 'English'}
          </Button>
          {role === 'PRIMARY' && (
            <Button
              variant="secondary"
              onClick={() => setPopupBlocked(!window.open('/display', 'svara-display', 'popup'))}
            >
              <MonitorUp size={16} aria-hidden="true" />
              Open display
            </Button>
          )}
        </span>
      </header>
      <main className="device-main">
        {popupBlocked && (
          <p className="form-notice" role="status">
            The browser blocked the display window. <a href="/display">Open the display here</a>.
          </p>
        )}
        {connection === 'offline' && (
          <p className="form-notice form-notice--error" role="alert">
            Offline. Showing the last complete release; answers are unavailable until the connection
            returns.
          </p>
        )}
        {activity.kind === 'error' && (
          <p className="form-notice form-notice--error" role="alert">
            {activity.message}
          </p>
        )}
        {release ? (
          <section className="device-release" aria-label="Current release">
            <div className="device-greeting" lang={locale === 'ne' ? 'ne' : 'en'}>
              <p className="eyebrow">
                {release.botName} · v{release.version}
              </p>
              {role === 'PRIMARY' && <h1>{release.greeting[locale]}</h1>}
            </div>
            <Slides key={release.id} prepared={shown} role={role} locale={locale} />
          </section>
        ) : (
          <section className="device-idle" aria-label="Current release">
            <h1>{role === 'PRIMARY' ? 'Nothing scheduled' : 'Waiting for the kiosk'}</h1>
            <p className="muted">
              {role === 'PRIMARY'
                ? 'This kiosk is idle until a release is scheduled for it.'
                : 'This display mirrors the release the kiosk has applied.'}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
