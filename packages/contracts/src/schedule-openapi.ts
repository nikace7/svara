import { z } from 'zod';
import {
  deploymentCancelSchema,
  deploymentCreateSchema,
  deploymentSaveSchema,
  deploymentSummarySchema,
  deviceTimelineSchema,
  eventArchiveSchema,
  eventCreateSchema,
  eventListSchema,
  eventSaveSchema,
  eventSummarySchema,
  overrideCreateSchema,
  scheduleBoardSchema,
} from './schedules.js';

const input = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' });
const output = (schema: z.ZodType) =>
  z.toJSONSchema(z.object({ data: schema }), { target: 'openapi-3.0' });

/** OpenAPI 3.0 shapes derive from the same strict schemas used at the domain boundary. */
export const scheduleApiSchemas = {
  eventCreate: input(eventCreateSchema),
  eventSave: input(eventSaveSchema),
  eventArchive: input(eventArchiveSchema),
  event: output(eventSummarySchema),
  events: output(eventListSchema),
  deploymentCreate: input(deploymentCreateSchema),
  deploymentSave: input(deploymentSaveSchema),
  deploymentCancel: input(deploymentCancelSchema),
  override: input(overrideCreateSchema),
  deployment: output(deploymentSummarySchema),
  board: output(scheduleBoardSchema),
  timeline: output(deviceTimelineSchema),
};
