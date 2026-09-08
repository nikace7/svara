import { z } from 'zod';
import {
  botArchiveSchema,
  botCreateSchema,
  botDetailSchema,
  botPageSchema,
  botSaveSchema,
} from './authoring.js';

/** OpenAPI 3.0 shapes derive from the same strict schemas used at the domain boundary. */
export const authoringApiSchemas = {
  create: z.toJSONSchema(botCreateSchema, { target: 'openapi-3.0', io: 'input' }),
  save: z.toJSONSchema(botSaveSchema, { target: 'openapi-3.0', io: 'input' }),
  archive: z.toJSONSchema(botArchiveSchema, { target: 'openapi-3.0', io: 'input' }),
  detail: z.toJSONSchema(z.object({ data: botDetailSchema }), { target: 'openapi-3.0' }),
  page: z.toJSONSchema(z.object({ data: botPageSchema }), { target: 'openapi-3.0' }),
};
