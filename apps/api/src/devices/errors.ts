import type { Response } from 'express';
import type { DeviceError } from '@svara/domain';

const errors: Record<DeviceError['code'], readonly [number, string]> = {
  INVALID_INPUT: [400, 'Check the device fields and try again.'],
  PRECONDITION_REQUIRED: [428, 'Include the device’s current expectedRevision.'],
  REVISION_CONFLICT: [409, 'This device changed. Reload its settings before saving again.'],
  REVISION_LIMIT: [422, 'This device has reached its configuration revision limit.'],
  DEVICE_DISABLED: [409, 'Enable this device before creating a pairing code.'],
  INVALID_PAIRING: [
    400,
    'This pairing code is incorrect, expired, already used or no longer available.',
  ],
  DEVICE_UNAUTHENTICATED: [401, 'Pair this browser with a device to continue.'],
  PAIRING_REPLACEMENT_REQUIRED: [409, 'Confirm replacing this browser profile’s existing pairing.'],
  INVALID_TICKET: [401, 'This connection ticket is invalid or expired. Request a fresh ticket.'],
  TICKET_LIMIT: [
    429,
    'Too many connection attempts are pending. Wait before requesting another ticket.',
  ],
  PRIMARY_CONFLICT: [
    409,
    'Another primary window controls this kiosk. Close it or wait for its connection to expire.',
  ],
  CONNECTION_LIMIT: [409, 'Close an extra display window before opening another.'],
  GRANT_EXPIRED: [
    401,
    'The device connection has expired or was revoked. Reconnect with a fresh ticket.',
  ],
  DISPLAY_READ_ONLY: [403, 'This display can only receive presentation and subtitle state.'],
};

export function deviceErrorResponse(error: DeviceError, response: Response): void {
  const [status, message] = errors[error.code];
  if (error.code === 'TICKET_LIMIT') response.setHeader('Retry-After', '60');
  response.status(status).json({
    error: {
      code: error.code,
      message,
      fieldErrors: {},
      retryable: error.code === 'TICKET_LIMIT',
    },
    ...(error.currentRevision === undefined ? {} : { currentRevision: error.currentRevision }),
    requestId: response.getHeader('x-request-id'),
  });
}
