import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Namespace, Socket } from 'socket.io';
import {
  DEVICE_EVENTS,
  DEVICE_LIMITS,
  commandAckEventSchema,
  deviceHeartbeatSchema,
  deviceRoleSchema,
} from '@svara/contracts';
import { DeviceError } from '@svara/domain';
import type { DeviceCommands, DeviceRuntime, RuntimeActor } from '@svara/domain';

export interface DeviceGatewayOptions {
  origin: string;
  runtime: Pick<DeviceRuntime, 'redeemTicket' | 'heartbeat' | 'closeGrant'>;
  commands: Pick<DeviceCommands, 'snapshot' | 'applied' | 'acknowledge'>;
  /** Close a socket that sends no heartbeat for this long. */
  silenceMs?: number;
}

const meta = () => ({
  v: 1 as const,
  eventId: randomUUID(),
  occurredAt: new Date().toISOString(),
  correlationId: randomUUID(),
});
const code = (error: unknown) =>
  error instanceof DeviceError
    ? error.code
    : error instanceof Error && 'code' in error
      ? String(error.code)
      : 'UNAVAILABLE';

/**
 * The `/devices` namespace. A one-use ticket in the handshake auth payload fixes the actor;
 * rooms are derived from it, never from client input. Displays only receive state.
 */
export class DeviceGateway {
  private io: Server | undefined;
  private devices: Namespace | undefined;

  constructor(private readonly options: DeviceGatewayOptions) {}

  attach(server: HttpServer): void {
    const { origin } = this.options;
    this.io = new Server(server, {
      path: '/socket.io',
      serveClient: false,
      transports: ['websocket'],
      maxHttpBufferSize: 16 * 1024,
      // Same origin only: the handshake must come from the configured application.
      allowRequest: (request, callback) =>
        callback(
          null,
          request.headers.origin === origin && request.headers.host === new URL(origin).host,
        ),
    });
    this.devices = this.io.of('/devices');
    this.devices.use((socket, next) => {
      const role = deviceRoleSchema.safeParse(socket.handshake.auth?.role);
      const ticket = socket.handshake.auth?.ticket;
      if (!role.success || typeof ticket !== 'string') {
        next(Object.assign(new Error('INVALID_TICKET'), { data: { code: 'INVALID_TICKET' } }));
        return;
      }
      this.options.runtime
        .redeemTicket(ticket, { namespace: '/devices', role: role.data })
        .then((actor) => {
          socket.data.actor = actor;
          next();
        })
        .catch((error: unknown) =>
          next(Object.assign(new Error(code(error)), { data: { code: code(error) } })),
        );
    });
    this.devices.on('connection', (socket) => this.connected(socket));
  }

  private connected(socket: Socket): void {
    const actor = socket.data.actor as RuntimeActor;
    void socket.join([`device:${actor.deviceId}`, `device:${actor.deviceId}:${actor.role}`]);
    let silence: ReturnType<typeof setTimeout>;
    const quiet = () => {
      clearTimeout(silence);
      silence = setTimeout(
        () => this.fail(socket, 'GRANT_EXPIRED'),
        this.options.silenceMs ?? DEVICE_LIMITS.leaseMilliseconds,
      );
    };
    quiet();
    socket.on(DEVICE_EVENTS.heartbeat, (value: unknown) => {
      if (!deviceHeartbeatSchema.safeParse(value).success)
        return this.reject(socket, 'INVALID_INPUT');
      this.options.runtime
        .heartbeat(actor.id)
        .then(quiet, (error) => this.fail(socket, code(error)));
    });
    socket.on(DEVICE_EVENTS.ack, (value: unknown) => {
      const parsed = commandAckEventSchema.safeParse(value);
      if (!parsed.success) return this.reject(socket, 'INVALID_INPUT');
      const { commandId, appliedRevision, result, reason } = parsed.data;
      const ack = { commandId, appliedRevision, result, reason };
      this.options.commands.acknowledge(actor, ack).then(
        async (outcome) => {
          socket.emit(DEVICE_EVENTS.acked, { ...meta(), ...outcome });
          if (outcome.result === 'APPLIED') await this.mirror(actor.deviceId);
        },
        (error) => this.reject(socket, code(error)),
      );
    });
    socket.on('disconnect', () => {
      clearTimeout(silence);
      this.options.runtime.closeGrant(actor.id).catch(() => undefined);
    });
    void (actor.role === 'PRIMARY' ? this.desired(socket) : this.display(socket));
  }

  private async desired(socket: Socket): Promise<void> {
    try {
      const snapshot = await this.options.commands.snapshot(socket.data.actor as RuntimeActor);
      socket.emit(DEVICE_EVENTS.desired, { ...meta(), ...snapshot });
    } catch (error) {
      this.fail(socket, code(error));
    }
  }

  private async display(socket: Socket): Promise<void> {
    try {
      const state = await this.options.commands.applied(socket.data.actor as RuntimeActor);
      socket.emit(DEVICE_EVENTS.display, { ...meta(), ...state });
    } catch (error) {
      this.fail(socket, code(error));
    }
  }

  /** Displays mirror what the primary confirmed, so they refresh after each applied ack. */
  private async mirror(deviceId: string): Promise<void> {
    for (const socket of await this.room(`device:${deviceId}:DISPLAY`)) await this.display(socket);
  }

  /** Worker wake-up: resend the current desired snapshot to each connected primary. */
  async wake(deviceIds: readonly string[]): Promise<void> {
    for (const deviceId of new Set(deviceIds))
      for (const socket of await this.room(`device:${deviceId}:PRIMARY`))
        await this.desired(socket);
  }

  /** Revocation, disabling or re-pairing takes effect on connected windows immediately. */
  disconnect(deviceId: string): void {
    this.devices
      ?.to(`device:${deviceId}`)
      .emit(DEVICE_EVENTS.error, { ...meta(), code: 'DEVICE_REVOKED', message: 'Access revoked.' });
    this.devices?.in(`device:${deviceId}`).disconnectSockets(true);
  }

  async close(): Promise<void> {
    await this.io?.close();
  }

  private async room(name: string): Promise<Socket[]> {
    if (!this.devices) return [];
    return (await this.devices.in(name).fetchSockets()) as unknown as Socket[];
  }

  private reject(socket: Socket, reason: string): void {
    socket.emit(DEVICE_EVENTS.error, { ...meta(), code: reason, message: reason });
  }

  private fail(socket: Socket, reason: string): void {
    this.reject(socket, reason);
    socket.disconnect(true);
  }
}
