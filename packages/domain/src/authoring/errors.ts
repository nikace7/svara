export type AuthoringErrorCode =
  | 'PRECONDITION_REQUIRED'
  | 'REVISION_CONFLICT'
  | 'ARCHIVED'
  | 'INCOMPLETE_TRANSLATIONS'
  | 'INVALID_SLIDE_ORDER'
  | 'PRESENTATION_LIMIT'
  | 'SLIDE_LIMIT';
export class AuthoringError extends Error {
  constructor(
    readonly code: AuthoringErrorCode,
    readonly currentRevision?: number,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(code);
    this.name = 'AuthoringError';
  }
}
