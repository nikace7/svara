export type IdentityErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'LAST_OWNER'
  | 'INVALID_LINK';

export class IdentityError extends Error {
  constructor(readonly code: IdentityErrorCode) {
    super(code);
    this.name = 'IdentityError';
  }
}
