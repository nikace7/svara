import type { ReleaseReadiness } from '@svara/contracts';

export type ReleaseErrorCode =
  | 'RELEASE_NOT_READY'
  | 'IDEMPOTENCY_REQUIRED'
  | 'IDEMPOTENCY_INVALID'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PREVIEW_EXPIRED'
  | 'RELEASE_LIMIT';
export class ReleaseError extends Error {
  constructor(
    readonly code: ReleaseErrorCode,
    readonly readiness?: ReleaseReadiness,
  ) {
    super(code);
    this.name = 'ReleaseError';
  }
}
