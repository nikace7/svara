import type { MediaRejection } from '@svara/contracts';

export class MediaError extends Error {
  constructor(
    readonly code:
      MediaRejection | 'MEDIA_BUSY' | 'MEDIA_NOT_READY' | 'MEDIA_QUOTA' | 'INVALID_RANGE',
  ) {
    super(code);
    this.name = 'MediaError';
  }
}
