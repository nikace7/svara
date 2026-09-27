import { z } from 'zod';
import {
  deviceCreateSchema,
  deviceSaveSchema,
  deviceRevisionSchema,
  deviceSummarySchema,
  devicePairHttpSchema,
  pairingChallengeSchema,
  deviceIdentitySchema,
  deviceTicketSchema,
  deviceTicketResultSchema,
} from './devices.js';
import {
  releaseCreateSchema,
  releaseReadinessSchema,
  releasePageSchema,
  releaseDetailSchema,
  releaseSearchSchema,
  releaseSearchResultSchema,
} from './releases.js';
import { mediaDeleteSchema, mediaDetailSchema, mediaPageSchema } from './media.js';
import {
  presentationCreateSchema,
  presentationSaveSchema,
  presentationDeleteSchema,
  presentationDetailSchema,
  presentationListSchema,
  presentationSelectionSchema,
  presentationSelectionResultSchema,
  slideCreateSchema,
  slideSaveSchema,
  slideDeleteSchema,
  slideOrderSchema,
} from './presentations.js';
import {
  botArchiveSchema,
  botCreateSchema,
  botDetailSchema,
  botPageSchema,
  botSaveSchema,
} from './authoring.js';
import {
  knowledgeApprovalSchema,
  knowledgeCreateSchema,
  knowledgeDeleteSchema,
  knowledgeDetailSchema,
  knowledgePageSchema,
  knowledgeSaveSchema,
  knowledgeSelectionSchema,
} from './knowledge.js';

/** OpenAPI 3.0 shapes derive from the same strict schemas used at the domain boundary. */
export const authoringApiSchemas = {
  create: z.toJSONSchema(botCreateSchema, { target: 'openapi-3.0', io: 'input' }),
  save: z.toJSONSchema(botSaveSchema, { target: 'openapi-3.0', io: 'input' }),
  archive: z.toJSONSchema(botArchiveSchema, { target: 'openapi-3.0', io: 'input' }),
  detail: z.toJSONSchema(z.object({ data: botDetailSchema }), { target: 'openapi-3.0' }),
  page: z.toJSONSchema(z.object({ data: botPageSchema }), { target: 'openapi-3.0' }),
};

export const knowledgeApiSchemas = {
  create: z.toJSONSchema(knowledgeCreateSchema, { target: 'openapi-3.0', io: 'input' }),
  save: z.toJSONSchema(knowledgeSaveSchema, { target: 'openapi-3.0', io: 'input' }),
  approval: z.toJSONSchema(knowledgeApprovalSchema, { target: 'openapi-3.0', io: 'input' }),
  selection: z.toJSONSchema(knowledgeSelectionSchema, { target: 'openapi-3.0', io: 'input' }),
  remove: z.toJSONSchema(knowledgeDeleteSchema, { target: 'openapi-3.0', io: 'input' }),
  detail: z.toJSONSchema(z.object({ data: knowledgeDetailSchema }), { target: 'openapi-3.0' }),
  page: z.toJSONSchema(z.object({ data: knowledgePageSchema }), { target: 'openapi-3.0' }),
  removed: z.toJSONSchema(
    z.object({ data: z.object({ ok: z.literal(true), botRevision: z.number().int().positive() }) }),
    { target: 'openapi-3.0' },
  ),
};

export const mediaApiSchemas = {
  detail: z.toJSONSchema(z.object({ data: mediaDetailSchema }), { target: 'openapi-3.0' }),
  page: z.toJSONSchema(z.object({ data: mediaPageSchema }), { target: 'openapi-3.0' }),
  remove: z.toJSONSchema(mediaDeleteSchema, { target: 'openapi-3.0', io: 'input' }),
  removed: z.toJSONSchema(z.object({ data: z.object({ ok: z.literal(true) }) }), {
    target: 'openapi-3.0',
  }),
};

export const presentationApiSchemas = {
  create: z.toJSONSchema(presentationCreateSchema, { target: 'openapi-3.0', io: 'input' }),
  save: z.toJSONSchema(presentationSaveSchema, { target: 'openapi-3.0', io: 'input' }),
  remove: z.toJSONSchema(presentationDeleteSchema, { target: 'openapi-3.0', io: 'input' }),
  selection: z.toJSONSchema(presentationSelectionSchema, { target: 'openapi-3.0', io: 'input' }),
  slideCreate: z.toJSONSchema(slideCreateSchema, { target: 'openapi-3.0', io: 'input' }),
  slideSave: z.toJSONSchema(slideSaveSchema, { target: 'openapi-3.0', io: 'input' }),
  slideRemove: z.toJSONSchema(slideDeleteSchema, { target: 'openapi-3.0', io: 'input' }),
  order: z.toJSONSchema(slideOrderSchema, { target: 'openapi-3.0', io: 'input' }),
  detail: z.toJSONSchema(z.object({ data: presentationDetailSchema }), { target: 'openapi-3.0' }),
  list: z.toJSONSchema(z.object({ data: presentationListSchema }), { target: 'openapi-3.0' }),
  selected: z.toJSONSchema(z.object({ data: presentationSelectionResultSchema }), {
    target: 'openapi-3.0',
  }),
  removed: knowledgeApiSchemas.removed,
};

export const releaseApiSchemas = {
  create: z.toJSONSchema(releaseCreateSchema, { target: 'openapi-3.0', io: 'input' }),
  query: z.toJSONSchema(releaseSearchSchema, { target: 'openapi-3.0', io: 'input' }),
  readiness: z.toJSONSchema(z.object({ data: releaseReadinessSchema }), { target: 'openapi-3.0' }),
  page: z.toJSONSchema(z.object({ data: releasePageSchema }), { target: 'openapi-3.0' }),
  detail: z.toJSONSchema(z.object({ data: releaseDetailSchema }), { target: 'openapi-3.0' }),
  search: z.toJSONSchema(z.object({ data: releaseSearchResultSchema }), { target: 'openapi-3.0' }),
};

export const deviceApiSchemas = {
  create: z.toJSONSchema(deviceCreateSchema, { target: 'openapi-3.0', io: 'input' }),
  save: z.toJSONSchema(deviceSaveSchema, { target: 'openapi-3.0', io: 'input' }),
  revision: z.toJSONSchema(deviceRevisionSchema, { target: 'openapi-3.0', io: 'input' }),
  detail: z.toJSONSchema(z.object({ data: deviceSummarySchema }), { target: 'openapi-3.0' }),
  page: z.toJSONSchema(
    z.object({
      data: z.array(deviceSummarySchema),
      page: z.object({ nextCursor: z.uuid().nullable() }),
    }),
    { target: 'openapi-3.0' },
  ),
  pairing: z.toJSONSchema(z.object({ data: pairingChallengeSchema }), { target: 'openapi-3.0' }),
  pair: z.toJSONSchema(devicePairHttpSchema, { target: 'openapi-3.0', io: 'input' }),
  identity: z.toJSONSchema(z.object({ data: deviceIdentitySchema }), { target: 'openapi-3.0' }),
  ticket: z.toJSONSchema(deviceTicketSchema, { target: 'openapi-3.0', io: 'input' }),
  ticketResult: z.toJSONSchema(z.object({ data: deviceTicketResultSchema }), {
    target: 'openapi-3.0',
  }),
};
