export type ConversationErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'PRECONDITION_REQUIRED'
  | 'REVISION_CONFLICT'
  | 'NOT_READY'
  | 'RELEASE_UNAVAILABLE'
  | 'SESSION_ENDED'
  | 'STALE_GENERATION'
  | 'DUPLICATE_MESSAGE'
  | 'RETRY_UNAVAILABLE'
  | 'RESUME_UNAVAILABLE'
  | 'CONCURRENCY_LIMIT'
  | 'DAILY_LIMIT'
  | 'GRANT_LIMIT'
  | 'VISITOR_UNAUTHENTICATED'
  | 'LINK_UNAVAILABLE';

export class ConversationError extends Error {
  constructor(
    readonly code: ConversationErrorCode,
    readonly currentRevision?: number,
  ) {
    super(code);
    this.name = 'ConversationError';
  }
}
