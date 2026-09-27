import { z } from 'zod';
import { revisionSchema } from './authoring.js';

export const DEVICE_LIMITS = {
  pairingMilliseconds: 300000,
  pairingAttempts: 5,
  ticketMilliseconds: 60000,
  pendingTicketsPerRole: 4,
  heartbeatMilliseconds: 10000,
  leaseMilliseconds: 35000,
  displayConnections: 2,
} as const;

const name = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !value.includes('\u0000'), 'NUL characters are not supported.');
export const deviceCapabilitiesSchema = z.strictObject({
  microphone: z.boolean(),
  speaker: z.boolean(),
  secondaryDisplay: z.boolean(),
});
export const deviceCreateSchema = z.strictObject({
  name,
  capabilities: deviceCapabilitiesSchema.default({
    microphone: false,
    speaker: false,
    secondaryDisplay: false,
  }),
});
export const deviceSaveSchema = z.strictObject({
  name,
  capabilities: deviceCapabilitiesSchema,
  enabled: z.boolean(),
  maintenanceMode: z.boolean(),
  expectedRevision: revisionSchema,
});
export const deviceRevisionSchema = z.strictObject({ expectedRevision: revisionSchema });
export const deviceListSchema = z.strictObject({
  search: z
    .string()
    .trim()
    .max(120)
    .refine((value) => !value.includes('\u0000'), 'NUL characters are not supported.')
    .default(''),
  cursor: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
export const deviceListQuerySchema = z
  .strictObject({
    search: z.string().max(120).optional(),
    cursor: z.uuid().optional(),
    limit: z
      .string()
      .regex(/^[0-9]{1,3}$/)
      .transform(Number)
      .optional(),
  })
  .pipe(deviceListSchema);
export const devicePairSchema = z.strictObject({
  challengeId: z.uuid(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/),
});
export const deviceRoleSchema = z.enum(['PRIMARY', 'DISPLAY']);
export const devicePairHttpSchema = devicePairSchema.extend({
  replaceExisting: z.boolean().default(false),
});
export const deviceTicketSchema = z.strictObject({
  namespace: z.literal('/devices'),
  role: deviceRoleSchema,
});
export const deviceSummarySchema = z.strictObject({
  id: z.uuid(),
  name,
  capabilities: deviceCapabilitiesSchema,
  enabled: z.boolean(),
  maintenanceMode: z.boolean(),
  revision: z.number().int().positive(),
  paired: z.boolean(),
  connection: z.enum(['NEVER_SEEN', 'ONLINE', 'OFFLINE']),
  lastSeenAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const devicePageSchema = z.strictObject({
  items: z.array(deviceSummarySchema).max(100),
  nextCursor: z.uuid().nullable(),
});
export const deviceIdentitySchema = z.strictObject({
  device: deviceSummarySchema,
  csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const pairingChallengeSchema = z.strictObject({
  id: z.uuid(),
  deviceId: z.uuid(),
  code: devicePairSchema.shape.code,
  expiresAt: z.iso.datetime(),
  revision: z.number().int().positive(),
});
export const deviceTicketResultSchema = z.strictObject({
  ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.iso.datetime(),
});
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;
export type DeviceRole = z.infer<typeof deviceRoleSchema>;
export type DevicePage = z.infer<typeof devicePageSchema>;
export type PairingChallenge = z.infer<typeof pairingChallengeSchema>;
