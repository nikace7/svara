export type ScheduleErrorCode =
  | 'PRECONDITION_REQUIRED'
  | 'REVISION_CONFLICT'
  | 'SCHEDULE_CONFLICT'
  | 'OVERRIDE_CONFLICT'
  | 'RELEASE_NOT_SCHEDULABLE'
  | 'EVENT_ARCHIVED'
  | 'DEPLOYMENT_CLOSED'
  | 'WINDOW_INVALID';

export class ScheduleError extends Error {
  readonly currentRevision: number | undefined;
  /** Same-organisation deployments that block the change; never another tenant's IDs. */
  readonly conflictIds: string[] | undefined;
  constructor(
    readonly code: ScheduleErrorCode,
    detail: { currentRevision?: number; conflictIds?: string[] } = {},
  ) {
    super(code);
    this.name = 'ScheduleError';
    this.currentRevision = detail.currentRevision;
    this.conflictIds = detail.conflictIds;
  }
}
