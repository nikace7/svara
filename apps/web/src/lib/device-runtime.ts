import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { DEVICE_EVENTS, DEVICE_LIMITS } from '@svara/contracts';
import type { DeviceSummary, RuntimeManifest, RuntimeRelease } from '@svara/contracts';

export type DeviceRole = 'PRIMARY' | 'DISPLAY';
export interface DeviceIdentity {
  device: DeviceSummary;
  csrfToken: string;
}
export class DeviceRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

async function runtime<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/runtime${path}`, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok)
    throw new DeviceRuntimeError(
      body.error?.code ?? 'UNAVAILABLE',
      body.error?.message ?? 'The device service is unavailable.',
      response.status,
    );
  return body.data as T;
}

/** The paired identity of this browser profile, or null when it is not paired. */
export async function deviceIdentity(): Promise<DeviceIdentity | null> {
  try {
    return await runtime<DeviceIdentity>('/device');
  } catch (error) {
    if (error instanceof DeviceRuntimeError && error.status === 401) return null;
    throw error;
  }
}

export function pairDevice(input: {
  challengeId: string;
  code: string;
  replaceExisting: boolean;
}): Promise<DeviceIdentity> {
  return runtime<DeviceIdentity>('/pair', { method: 'POST', body: JSON.stringify(input) });
}

export function loadManifest(view: 'desired' | 'applied'): Promise<RuntimeManifest> {
  return runtime<RuntimeManifest>(`/manifest?view=${view}`);
}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** A release whose media has been downloaded and checksum-verified, ready to swap in. */
export interface PreparedRelease {
  release: RuntimeRelease;
  urls: Record<string, string>;
}

/**
 * Downloads and verifies every asset the chosen slides need before anything is shown.
 * Any failure throws with a coded reason and leaves the caller's current release intact.
 */
export async function prepareRelease(
  release: RuntimeRelease,
  screen: DeviceRole,
  load: (id: string) => Promise<ArrayBuffer> = async (id) => {
    const response = await fetch(`/api/v1/runtime/media/${id}/content`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new DeviceRuntimeError('DOWNLOAD_FAILED', 'Media download failed.');
    return response.arrayBuffer();
  },
  toUrl: (bytes: ArrayBuffer, mimeType: string) => string = (bytes, mimeType) =>
    URL.createObjectURL(new Blob([bytes], { type: mimeType })),
): Promise<PreparedRelease> {
  const target = screen === 'PRIMARY' ? 'PRIMARY' : 'SECONDARY';
  const needed = new Set(
    release.slides
      .filter((slide) => slide.target === target || slide.target === 'BOTH')
      .flatMap((slide) => (slide.mediaId ? [slide.mediaId] : [])),
  );
  const urls: Record<string, string> = {};
  for (const asset of release.media.filter((item) => needed.has(item.id))) {
    let bytes: ArrayBuffer;
    try {
      bytes = await load(asset.id);
    } catch {
      throw new DeviceRuntimeError('DOWNLOAD_FAILED', 'Media download failed.');
    }
    if (
      bytes.byteLength !== asset.byteLength ||
      hex(await crypto.subtle.digest('SHA-256', bytes)) !== asset.sha256
    )
      throw new DeviceRuntimeError('CHECKSUM_MISMATCH', 'Downloaded media failed its checksum.');
    urls[asset.id] = toUrl(bytes, asset.mimeType);
  }
  return { release, urls };
}

export const meta = () => ({
  v: 1 as const,
  eventId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  correlationId: crypto.randomUUID(),
});

/**
 * One device connection with automatic reconnects. Every attempt redeems a fresh one-use
 * ticket. It stops for good when the server says access was revoked.
 */
export function connectDevice(
  role: DeviceRole,
  csrfToken: string,
  handlers: {
    online: (socket: Socket) => void;
    offline: () => void;
    revoked: () => void;
    event: (name: string, value: unknown, socket: Socket) => void;
  },
): () => void {
  let stopped = false;
  let socket: Socket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const again = () => {
    if (stopped) return;
    handlers.offline();
    retry = setTimeout(open, Math.min(1000 * 2 ** failures++, 15000));
  };
  async function open() {
    if (stopped) return;
    let ticket: string;
    try {
      ticket = (
        await runtime<{ ticket: string }>('/tickets', {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ namespace: '/devices', role }),
        })
      ).ticket;
    } catch (error) {
      if (error instanceof DeviceRuntimeError && error.status === 401) {
        stopped = true;
        handlers.revoked();
        return;
      }
      again();
      return;
    }
    if (stopped) return;
    socket = io('/devices', {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { ticket, role },
      reconnection: false,
    });
    socket.on('connect', () => {
      failures = 0;
      handlers.online(socket!);
      heartbeat = setInterval(
        () => socket?.emit(DEVICE_EVENTS.heartbeat, meta()),
        DEVICE_LIMITS.heartbeatMilliseconds,
      );
    });
    socket.onAny((name: string, value: unknown) => {
      if (name === DEVICE_EVENTS.error && (value as { code?: string })?.code === 'DEVICE_REVOKED') {
        stopped = true;
        handlers.revoked();
      }
      handlers.event(name, value, socket!);
    });
    socket.on('connect_error', () => again());
    socket.on('disconnect', () => {
      clearInterval(heartbeat);
      again();
    });
  }
  void open();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(heartbeat);
    socket?.disconnect();
  };
}
