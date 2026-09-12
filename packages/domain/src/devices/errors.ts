export type DeviceErrorCode =
  | 'INVALID_INPUT'
  | 'PRECONDITION_REQUIRED'
  | 'REVISION_CONFLICT'
  | 'REVISION_LIMIT'
  | 'DEVICE_DISABLED'
  | 'INVALID_PAIRING'
  | 'DEVICE_UNAUTHENTICATED'
  | 'INVALID_TICKET'
  | 'TICKET_LIMIT'
  | 'PRIMARY_CONFLICT'
  | 'CONNECTION_LIMIT'
  | 'GRANT_EXPIRED'
  | 'DISPLAY_READ_ONLY';

export class DeviceError extends Error {
  constructor(
    readonly code: DeviceErrorCode,
    readonly currentRevision?: number,
  ) {
    super(code);
    this.name = 'DeviceError';
  }
}
