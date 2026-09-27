import { z } from 'zod';
import { eventMetadataSchema } from './events.js';
import { slideTargetSchema } from './presentations.js';
import { releaseMediaSchema } from './releases.js';
import { commandAckSchema, desiredReleaseSchema } from './schedules.js';

/** Protocol version 1 of the `/devices` namespace. The server derives the device from the
 * ticket; nothing a client sends can name another device or organisation. */
export const DEVICE_EVENTS = {
  hello: 'device.hello',
  heartbeat: 'device.heartbeat',
  desired: 'release.desired',
  execute: 'command.execute',
  ack: 'command.ack',
  acked: 'command.acked',
  display: 'display.state',
  error: 'device.error',
} as const;

const text = z.strictObject({ en: z.string(), ne: z.string() });
/** What a kiosk renders: a release without its knowledge collection. */
export const runtimeReleaseSchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int().positive(),
  botName: z.string(),
  greeting: text,
  slides: z.array(
    z.strictObject({
      id: z.uuid(),
      position: z.number().int().nonnegative(),
      title: text,
      body: text,
      mediaId: z.uuid().nullable(),
      target: slideTargetSchema,
      durationSeconds: z.number().int().positive(),
    }),
  ),
  media: z.array(releaseMediaSchema),
});
export const runtimeManifestSchema = z.strictObject({
  view: z.enum(['desired', 'applied']),
  revision: z.number().int().nonnegative(),
  commandId: z.uuid().nullable(),
  release: runtimeReleaseSchema.nullable(),
});
export const runtimeManifestQuerySchema = z.strictObject({
  view: z.enum(['desired', 'applied']).default('desired'),
});

export const deviceHelloSchema = eventMetadataSchema.extend({
  appliedRevision: z.number().int().nonnegative(),
});
export const deviceHeartbeatSchema = eventMetadataSchema;
export const desiredEventSchema = eventMetadataSchema.extend(desiredReleaseSchema.shape);
export const commandAckEventSchema = eventMetadataSchema.extend(commandAckSchema.shape);
export const displayStateSchema = eventMetadataSchema.extend({
  revision: z.number().int().nonnegative(),
  releaseId: z.uuid().nullable(),
});
export const deviceErrorEventSchema = eventMetadataSchema.extend({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  message: z.string(),
});

export type RuntimeRelease = z.infer<typeof runtimeReleaseSchema>;
export type RuntimeManifest = z.infer<typeof runtimeManifestSchema>;
export type DesiredEvent = z.infer<typeof desiredEventSchema>;
export type DisplayState = z.infer<typeof displayStateSchema>;
export type DeviceErrorEvent = z.infer<typeof deviceErrorEventSchema>;

/** Worker → API wake-up on `<namespace>:device-commands`: IDs only, never a credential. */
export const commandWakeupSchema = z
  .array(z.strictObject({ commandId: z.uuid(), deviceId: z.uuid() }))
  .max(500);
