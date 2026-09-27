import { ScheduleError } from '@svara/domain';
import type { ScheduleErrorCode } from '@svara/domain';

const details: Record<ScheduleErrorCode, [number, string]> = {
  PRECONDITION_REQUIRED: [428, 'Include the current revision before changing this schedule.'],
  REVISION_CONFLICT: [
    409,
    'This schedule changed elsewhere. Your change has not been saved. Reload it before trying again.',
  ],
  SCHEDULE_CONFLICT: [
    409,
    'This device already has a deployment in that time. Change the times or edit the existing deployment.',
  ],
  OVERRIDE_CONFLICT: [
    409,
    'This device already has an active override. Replace it explicitly or end it first.',
  ],
  RELEASE_NOT_SCHEDULABLE: [
    422,
    'Only published releases can be scheduled. Draft previews stay in the studio.',
  ],
  EVENT_ARCHIVED: [409, 'Restore this event before adding deployments to it.'],
  DEPLOYMENT_CLOSED: [
    409,
    'This deployment has ended, been cancelled or is an override. Create a new one instead.',
  ],
  WINDOW_INVALID: [422, 'Choose an end time in the future, at most 31 days after the start.'],
};

/** The response for a scheduling failure, or undefined for any other exception. */
export function scheduleFailure(
  exception: unknown,
): { status: number; error: Record<string, unknown> } | undefined {
  if (!(exception instanceof ScheduleError)) return undefined;
  const [status, message] = details[exception.code];
  return {
    status,
    error: {
      code: exception.code,
      message,
      ...(exception.currentRevision === undefined
        ? {}
        : { currentRevision: exception.currentRevision }),
      ...(exception.conflictIds ? { conflictIds: exception.conflictIds } : {}),
      fieldErrors: {},
      retryable: false,
    },
  };
}
