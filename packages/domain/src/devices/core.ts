import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@svara/database';
import { deviceSummarySchema } from '@svara/contracts';
import type { DeviceSummary } from '@svara/contracts';
import { IdentityError } from '../identity/errors.js';
import { DeviceError } from './errors.js';

export type Transaction = Prisma.TransactionClient;
export const deviceInclude = {
  credentials: { where: { revokedAt: null }, select: { id: true } },
  grants: {
    where: { role: 'PRIMARY', revokedAt: null },
    select: { createdAt: true, lastSeenAt: true, expiresAt: true },
  },
} as const;
type StoredDevice = Prisma.DeviceGetPayload<{ include: typeof deviceInclude }>;
export function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DeviceError('INVALID_INPUT');
  return result.data;
}
export function mutation<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  if (value && typeof value === 'object' && !('expectedRevision' in value))
    throw new DeviceError('PRECONDITION_REQUIRED');
  return parse(schema, value);
}
export function checkPepper(pepper: string): void {
  if (pepper.length < 64) throw new Error('Devices require a configured token pepper.');
}
export function hashSecret(
  purpose: 'pairing' | 'device-credential' | 'device-ticket',
  value: string,
  pepper: string,
): string {
  return createHmac('sha256', pepper).update(`${purpose}\0${value}`).digest('base64url');
}
export function secretMatches(left: string, right: string): boolean {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
export function pairingCode(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
}
export const bearerPattern = /^[A-Za-z0-9_-]{43}$/;
export async function lockDevice(
  tx: Transaction,
  id: string,
  organisationId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id" = ${id}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`;
}
export async function loadDevice(
  tx: Transaction,
  id: string,
  organisationId: string,
): Promise<StoredDevice> {
  const device = await tx.device.findFirst({
    where: { id, organisationId },
    include: deviceInclude,
  });
  if (!device) throw new IdentityError('NOT_FOUND');
  return device;
}
export function summary(device: StoredDevice, now: Date): DeviceSummary {
  const online =
    device.enabled &&
    device.credentials.length > 0 &&
    device.grants.some(
      (grant) => grant.createdAt <= now && grant.lastSeenAt <= now && grant.expiresAt > now,
    );
  return deviceSummarySchema.parse({
    id: device.id,
    name: device.name,
    capabilities: device.capabilities,
    enabled: device.enabled,
    maintenanceMode: device.maintenanceMode,
    revision: device.revision,
    paired: device.credentials.length > 0,
    connection: online ? 'ONLINE' : device.lastSeenAt ? 'OFFLINE' : 'NEVER_SEEN',
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  });
}
export function requireRevision(revision: number, expected: number): void {
  if (revision !== expected) throw new DeviceError('REVISION_CONFLICT', revision);
  if (revision >= 2147483646) throw new DeviceError('REVISION_LIMIT');
}
/** Caller owns the device row lock. All invalidation commits with the staff mutation. */
export async function revokeAccess(
  tx: Transaction,
  deviceId: string,
  organisationId: string,
  now: Date,
): Promise<void> {
  const where = { deviceId, organisationId, revokedAt: null };
  await tx.deviceGrant.updateMany({ where, data: { revokedAt: now } });
  await tx.deviceTicket.updateMany({ where, data: { revokedAt: now } });
  await tx.deviceCredential.updateMany({ where, data: { revokedAt: now } });
  await tx.pairingChallenge.updateMany({ where, data: { revokedAt: now } });
}
