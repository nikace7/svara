export type AuthoringErrorCode = 'PRECONDITION_REQUIRED' | 'REVISION_CONFLICT' | 'ARCHIVED';
export class AuthoringError extends Error {
  constructor(
    readonly code: AuthoringErrorCode,
    readonly currentRevision?: number,
  ) {
    super(code);
    this.name = 'AuthoringError';
  }
}
