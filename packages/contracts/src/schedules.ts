import { z } from 'zod';
import { revisionSchema } from './authoring.js';
import { organisationInputSchema } from './identity.js';

export const SCHEDULE_LIMITS = {
  overrideDefaultMinutes: 30,
  overrideMaxMinutes: 1440,
  deploymentMaxDays: 31,
  boardMaxDays: 31,
  reconcileMilliseconds: 5000,
  commandScanMilliseconds: 1000,
  commandRetryMilliseconds: [1000, 2000, 4000, 8000, 15000],
  idleCommandHours: 24,
  timelineCommands: 20,
} as const;

// Control characters (including NUL, which PostgreSQL rejects) never belong in labels.
const label = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !/\p{Cc}/u.test(value), 'Remove control characters.');
const instant = z.iso.datetime();
const suggested = (value: { suggestedStartsAt: string | null; suggestedEndsAt: string | null }) =>
  !value.suggestedStartsAt ||
  !value.suggestedEndsAt ||
  Date.parse(value.suggestedEndsAt) > Date.parse(value.suggestedStartsAt);
const eventFields = z.strictObject({
  name: label(1, 120),
  venue: label(0, 160).default(''),
  timezone: organisationInputSchema.shape.timezone,
  suggestedStartsAt: instant.nullable().default(null),
  suggestedEndsAt: instant.nullable().default(null),
});
export const eventCreateSchema = eventFields.refine(suggested, {
  path: ['suggestedEndsAt'],
  message: 'End after the start.',
});
export const eventSaveSchema = eventFields
  .extend({ expectedRevision: revisionSchema })
  .refine(suggested, { path: ['suggestedEndsAt'], message: 'End after the start.' });
export const eventArchiveSchema = z.strictObject({
  archived: z.boolean(),
  expectedRevision: revisionSchema,
});
export const eventListQuerySchema = z.strictObject({
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export const eventSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  venue: z.string(),
  timezone: z.string(),
  suggestedStartsAt: instant.nullable(),
  suggestedEndsAt: instant.nullable(),
  archivedAt: instant.nullable(),
  revision: z.number().int().positive(),
  deploymentCount: z.number().int().nonnegative(),
  createdAt: instant,
  updatedAt: instant,
});
export const eventListSchema = z.strictObject({ items: z.array(eventSummarySchema).max(200) });

const window = { startsAt: instant, endsAt: instant };
const ordered = (value: { startsAt: string; endsAt: string }) =>
  Date.parse(value.endsAt) > Date.parse(value.startsAt);
export const deploymentCreateSchema = z
  .strictObject({
    deviceId: z.uuid(),
    releaseId: z.uuid(),
    eventId: z.uuid().nullable().default(null),
    ...window,
  })
  .refine(ordered, { path: ['endsAt'], message: 'End after the start.' });
export const deploymentSaveSchema = z
  .strictObject({
    releaseId: z.uuid(),
    eventId: z.uuid().nullable(),
    ...window,
    expectedRevision: revisionSchema,
  })
  .refine(ordered, { path: ['endsAt'], message: 'End after the start.' });
export const deploymentCancelSchema = z.strictObject({ expectedRevision: revisionSchema });
export const overrideCreateSchema = z.strictObject({
  releaseId: z.uuid(),
  minutes: z
    .number()
    .int()
    .min(1)
    .max(SCHEDULE_LIMITS.overrideMaxMinutes)
    .default(SCHEDULE_LIMITS.overrideDefaultMinutes),
  /** An active override is only replaced when it is named explicitly. */
  replaceOverrideId: z.uuid().nullable().default(null),
});
export const scheduleBoardQuerySchema = z
  .strictObject({ from: instant, to: instant })
  .refine(
    (value) =>
      Date.parse(value.to) > Date.parse(value.from) &&
      Date.parse(value.to) - Date.parse(value.from) <= SCHEDULE_LIMITS.boardMaxDays * 86_400_000,
    { path: ['to'], message: 'Choose a window of up to 31 days.' },
  );

export const deploymentStateSchema = z.enum(['UPCOMING', 'ACTIVE', 'ENDED', 'CANCELLED']);
export const deploymentSummarySchema = z.strictObject({
  id: z.uuid(),
  deviceId: z.uuid(),
  kind: z.enum(['SCHEDULED', 'OVERRIDE']),
  release: z.strictObject({
    id: z.uuid(),
    botId: z.uuid(),
    botName: z.string(),
    version: z.number().int().positive(),
  }),
  event: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  startsAt: instant,
  endsAt: instant,
  cancelledAt: instant.nullable(),
  state: deploymentStateSchema,
  revision: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export const desiredStateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  releaseId: z.uuid().nullable(),
  deploymentId: z.uuid().nullable(),
  appliedRevision: z.number().int().nonnegative(),
  appliedReleaseId: z.uuid().nullable(),
  appliedAt: instant.nullable(),
});
export const scheduleBoardSchema = z.strictObject({
  devices: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      enabled: z.boolean(),
      desired: desiredStateSchema,
    }),
  ),
  deployments: z.array(deploymentSummarySchema),
});
export const commandStatusSchema = z.enum([
  'QUEUED',
  'SENT',
  'ACKNOWLEDGED',
  'FAILED',
  'EXPIRED',
  'SUPERSEDED',
]);
export const commandSummarySchema = z.strictObject({
  id: z.uuid(),
  type: z.string(),
  stateRevision: z.number().int().positive(),
  releaseId: z.uuid().nullable(),
  status: commandStatusSchema,
  attempts: z.number().int().nonnegative(),
  createdAt: instant,
  sentAt: instant.nullable(),
  acknowledgedAt: instant.nullable(),
  result: z.enum(['APPLIED', 'REJECTED']).nullable(),
  reason: z.string().nullable(),
});
export const deviceTimelineSchema = z.strictObject({
  deviceId: z.uuid(),
  desired: desiredStateSchema,
  commands: z.array(commandSummarySchema).max(SCHEDULE_LIMITS.timelineCommands),
});

/** Payload of a `release.apply` command and of the reconnect snapshot. */
export const desiredReleaseSchema = z.strictObject({
  commandId: z.uuid().nullable(),
  revision: z.number().int().nonnegative(),
  releaseId: z.uuid().nullable(),
  deploymentId: z.uuid().nullable(),
});
export const commandAckSchema = z.strictObject({
  commandId: z.uuid(),
  appliedRevision: z.number().int().positive(),
  result: z.enum(['APPLIED', 'REJECTED']),
  reason: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,63}$/)
    .nullable()
    .default(null),
});

export type EventSummary = z.infer<typeof eventSummarySchema>;
export type DeploymentSummary = z.infer<typeof deploymentSummarySchema>;
export type DesiredState = z.infer<typeof desiredStateSchema>;
export type ScheduleBoard = z.infer<typeof scheduleBoardSchema>;
export type CommandSummary = z.infer<typeof commandSummarySchema>;
export type DeviceTimeline = z.infer<typeof deviceTimelineSchema>;
export type DesiredRelease = z.infer<typeof desiredReleaseSchema>;
export type CommandAck = z.infer<typeof commandAckSchema>;
