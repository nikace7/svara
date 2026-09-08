export type AuthoringErrorCode =
  'PRECONDITION_REQUIRED' | 'REVISION_CONFLICT' | 'ARCHIVED' | 'INCOMPLETE_TRANSLATIONS';
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
