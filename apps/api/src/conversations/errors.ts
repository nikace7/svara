import { ConversationError } from '@svara/domain';
import type { ConversationErrorCode } from '@svara/domain';

const details: Record<ConversationErrorCode, [number, string]> = {
  INVALID_INPUT: [400, 'The request is invalid.'],
  NOT_FOUND: [404, 'Resource not found.'],
  PRECONDITION_REQUIRED: [428, 'Include the link revision before saving.'],
  REVISION_CONFLICT: [409, 'This link changed elsewhere. Reload it before saving again.'],
  NOT_READY: [
    409,
    'This kiosk has no fully applied release to talk about yet. Wait for the update to finish.',
  ],
  RELEASE_UNAVAILABLE: [422, 'Choose a published release from this workspace.'],
  SESSION_ENDED: [409, 'This conversation has ended. Start a new one.'],
  STALE_GENERATION: [409, 'A newer question replaced this one.'],
  DUPLICATE_MESSAGE: [409, 'This question was already sent.'],
  RETRY_UNAVAILABLE: [409, 'Only an unfinished answer can be retried.'],
  RESUME_UNAVAILABLE: [409, 'That conversation cannot be resumed. Start a new one.'],
  CONCURRENCY_LIMIT: [429, 'Too many conversations are open. Try again shortly.'],
  DAILY_LIMIT: [429, 'Today’s live conversation allowance is used up. Try again tomorrow.'],
  GRANT_LIMIT: [429, 'This visit has reached its question limit. Reload the page to continue.'],
  VISITOR_UNAUTHENTICATED: [401, 'Open the assistant link again to continue.'],
  LINK_UNAVAILABLE: [404, 'This assistant link is no longer available.'],
};

/** The safe public shape of a conversation failure, or undefined for anything else. */
export function conversationFailure(exception: unknown):
  | {
      status: number;
      retryAfter: number | undefined;
      error: {
        code: string;
        message: string;
        fieldErrors: Record<string, never>;
        retryable: boolean;
        currentRevision?: number;
      };
    }
  | undefined {
  if (!(exception instanceof ConversationError)) return undefined;
  const [status, message] = details[exception.code];
  return {
    status,
    retryAfter:
      exception.code === 'CONCURRENCY_LIMIT'
        ? 5
        : exception.code === 'DAILY_LIMIT'
          ? 3600
          : undefined,
    error: {
      code: exception.code,
      message,
      fieldErrors: {},
      retryable: exception.code === 'CONCURRENCY_LIMIT',
      ...(exception.currentRevision === undefined
        ? {}
        : { currentRevision: exception.currentRevision }),
    },
  };
}
