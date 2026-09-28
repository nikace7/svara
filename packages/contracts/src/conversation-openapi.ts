import { z } from 'zod';
import {
  assistantLinkCreateSchema,
  assistantLinkSaveSchema,
  assistantLinkSchema,
  conversationAdmissionSchema,
  conversationAdmitSchema,
  conversationInterruptSchema,
  conversationSessionSchema,
  conversationTurnSchema,
  publicAssistantSchema,
  sessionDetailSchema,
  sessionSummarySchema,
  visitorGrantSchema,
} from './conversations.js';

const input = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' });
const output = (schema: z.ZodType) =>
  z.toJSONSchema(z.object({ data: schema }), { target: 'openapi-3.0' });

/** OpenAPI 3.0 shapes derive from the same strict schemas used at the domain boundary. */
export const conversationApiSchemas = {
  admit: input(conversationAdmitSchema),
  admission: output(conversationAdmissionSchema),
  turn: input(conversationTurnSchema),
  interrupt: input(conversationInterruptSchema),
  session: output(conversationSessionSchema),
  sessions: z.toJSONSchema(
    z.object({
      data: z.array(sessionSummarySchema),
      page: z.object({ nextCursor: z.string().nullable() }),
    }),
    { target: 'openapi-3.0' },
  ),
  sessionDetail: output(sessionDetailSchema),
  linkCreate: input(assistantLinkCreateSchema),
  linkSave: input(assistantLinkSaveSchema),
  link: output(assistantLinkSchema),
  links: output(z.array(assistantLinkSchema)),
  publicAssistant: output(publicAssistantSchema),
  grant: output(visitorGrantSchema),
};
