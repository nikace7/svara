import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ApiBodyOptions } from '@nestjs/swagger';
import type { Request } from 'express';
import { scheduleApiSchemas } from '@svara/contracts/schedule-openapi';
import type { ScheduleService } from '@svara/domain';
import { AUTH_BOUNDARY } from '../auth/boundary.js';
import type { StaffBoundary } from '../auth/boundary.js';
import { StaffGuard } from '../auth/guard.js';

export const SCHEDULE_SERVICE = Symbol('schedule-service');
export type ScheduleHttpService = Pick<
  ScheduleService,
  | 'listEvents'
  | 'createEvent'
  | 'saveEvent'
  | 'archiveEvent'
  | 'board'
  | 'getDeployment'
  | 'createDeployment'
  | 'saveDeployment'
  | 'cancelDeployment'
  | 'override'
  | 'timeline'
>;
type ApiSchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];
const schemas = scheduleApiSchemas as Record<keyof typeof scheduleApiSchemas, ApiSchema>;
const revisionRequired = ApiResponse({ status: 428, description: 'expectedRevision is required.' });
const revisionConflict = ApiResponse({
  status: 409,
  description: 'Stale revision (the error includes currentRevision) or a closed deployment.',
});
const conflictResponse = ApiResponse({
  status: 409,
  description:
    'SCHEDULE_CONFLICT or OVERRIDE_CONFLICT. conflictIds lists only this organisation’s blocking deployments.',
});
function available(service: ScheduleHttpService | null): ScheduleHttpService {
  if (!service) throw new ServiceUnavailableException();
  return service;
}

@Controller('events')
@ApiTags('Schedules')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class EventsController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(SCHEDULE_SERVICE) private readonly service: ScheduleHttpService | null,
  ) {}
  @Get()
  @ApiQuery({ name: 'archived', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ schema: schemas.events })
  async list(@Req() request: Request, @Query() query: unknown) {
    return { data: await available(this.service).listEvents(this.boundary.token(request), query) };
  }
  @Post()
  @ApiBody({ schema: schemas.eventCreate })
  @ApiCreatedResponse({ schema: schemas.event })
  async create(@Req() request: Request, @Body() value: unknown) {
    return { data: await available(this.service).createEvent(this.boundary.token(request), value) };
  }
  @Patch(':id')
  @ApiBody({ schema: schemas.eventSave })
  @ApiOkResponse({
    schema: schemas.event,
    description: 'Edits never move deployments; they own their times.',
  })
  @revisionRequired
  @revisionConflict
  async save(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).saveEvent(this.boundary.token(request), id, value),
    };
  }
  @Post(':id/archive')
  @HttpCode(200)
  @ApiBody({ schema: schemas.eventArchive })
  @ApiOkResponse({ schema: schemas.event })
  @revisionRequired
  @revisionConflict
  async archive(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).archiveEvent(this.boundary.token(request), id, value),
    };
  }
}

@Controller('deployments')
@ApiTags('Schedules')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class DeploymentsController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(SCHEDULE_SERVICE) private readonly service: ScheduleHttpService | null,
  ) {}
  @Get()
  @ApiQuery({ name: 'from', required: true, type: String, format: 'date-time' })
  @ApiQuery({ name: 'to', required: true, type: String, format: 'date-time' })
  @ApiOkResponse({
    schema: schemas.board,
    description: 'Devices with desired and applied state, and deployments overlapping [from, to).',
  })
  async board(@Req() request: Request, @Query() query: unknown) {
    return { data: await available(this.service).board(this.boundary.token(request), query) };
  }
  @Post()
  @ApiBody({ schema: schemas.deploymentCreate })
  @ApiCreatedResponse({ schema: schemas.deployment })
  @conflictResponse
  @ApiResponse({
    status: 422,
    description: 'Preview release, or a window that has ended or exceeds 31 days.',
  })
  async create(@Req() request: Request, @Body() value: unknown) {
    return {
      data: await available(this.service).createDeployment(this.boundary.token(request), value),
    };
  }
  @Get(':id')
  @ApiOkResponse({ schema: schemas.deployment })
  async get(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await available(this.service).getDeployment(this.boundary.token(request), id),
    };
  }
  @Patch(':id')
  @ApiBody({ schema: schemas.deploymentSave })
  @ApiOkResponse({ schema: schemas.deployment })
  @revisionRequired
  @conflictResponse
  async save(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).saveDeployment(this.boundary.token(request), id, value),
    };
  }
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiBody({ schema: schemas.deploymentCancel })
  @ApiOkResponse({ schema: schemas.deployment })
  @revisionRequired
  @revisionConflict
  async cancel(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).cancelDeployment(this.boundary.token(request), id, value),
    };
  }
}

@Controller('devices')
@ApiTags('Schedules')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class DeviceScheduleController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(SCHEDULE_SERVICE) private readonly service: ScheduleHttpService | null,
  ) {}
  @Post(':id/override')
  @ApiBody({ schema: schemas.override })
  @ApiCreatedResponse({
    schema: schemas.deployment,
    description: 'Starts now and wins over any schedule until it ends or is cancelled.',
  })
  @conflictResponse
  async override(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).override(this.boundary.token(request), id, value),
    };
  }
  @Get(':id/timeline')
  @ApiOkResponse({
    schema: schemas.timeline,
    description: 'Desired and acknowledged revisions with the latest commands.',
  })
  async timeline(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await available(this.service).timeline(this.boundary.token(request), id) };
  }
}
