import { z } from 'zod';

export const localeSchema = z.enum(['en-US', 'ne-NP']);
export const providerModeSchema = z.enum(['fixture', 'live']);

export const eventMetadataSchema = z.strictObject({
  v: z.literal(1),
  eventId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  correlationId: z.uuid(),
});

// An invalidation hint carries no authority to join an organisation's socket room.
export const deviceUpdatedSchema = eventMetadataSchema.extend({
  deviceId: z.uuid(),
  revision: z.number().int().nonnegative().max(2147483647),
});

export type Locale = z.infer<typeof localeSchema>;
export type ProviderMode = z.infer<typeof providerModeSchema>;
export type DeviceUpdatedEvent = z.infer<typeof deviceUpdatedSchema>;
