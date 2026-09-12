import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { presentationListQuerySchema } from '@svara/contracts';
import { presentationApiSchemas } from '@svara/contracts/authoring-openapi';
import { IdentityError } from '@svara/domain';
import type { PresentationService } from '@svara/domain';
import { AUTH_BOUNDARY } from '../auth/boundary.js';
import type { StaffBoundary } from '../auth/boundary.js';
import { StaffGuard } from '../auth/guard.js';

export const PRESENTATION_SERVICE = Symbol('presentation-service');
export type PresentationHttpService = Pick<
  PresentationService,
  | 'create'
  | 'get'
  | 'list'
  | 'save'
  | 'select'
  | 'remove'
  | 'createSlide'
  | 'saveSlide'
  | 'removeSlide'
  | 'reorder'
>;
type ApiSchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];
const schemas = presentationApiSchemas as Record<keyof typeof presentationApiSchemas, ApiSchema>;
function available(service: PresentationHttpService | null): PresentationHttpService {
  if (!service) throw new ServiceUnavailableException();
  return service;
}

@Controller('presentations')
@ApiTags('Presentations')
@ApiCookieAuth('staff')
@ApiResponse({
  status: 428,
  description: 'Mutations require the current presentation expectedRevision.',
})
@ApiResponse({ status: 409, description: 'Revision conflict, changed slide set or archived bot.' })
@UseGuards(StaffGuard)
export class PresentationsController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(PRESENTATION_SERVICE) private readonly service: PresentationHttpService | null,
  ) {}
  @Get()
  @ApiQuery({ name: 'botId', required: true, type: String, format: 'uuid' })
  @ApiOkResponse({ schema: schemas.list })
  async list(@Req() request: Request, @Query() query: unknown) {
    const parsed = presentationListQuerySchema.safeParse(query);
    if (!parsed.success) throw new IdentityError('INVALID_INPUT');
    return {
      data: await available(this.service).list(this.boundary.token(request), parsed.data.botId),
    };
  }
  @Post()
  @ApiBody({ schema: schemas.create })
  @ApiCreatedResponse({ schema: schemas.detail })
  @ApiResponse({ status: 422, description: 'Bot presentation limit reached.' })
  async create(@Req() request: Request, @Body() value: unknown) {
    return { data: await available(this.service).create(this.boundary.token(request), value) };
  }
  @Get(':id')
  @ApiOkResponse({ schema: schemas.detail })
  async get(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await available(this.service).get(this.boundary.token(request), id) };
  }
  @Patch(':id')
  @ApiBody({ schema: schemas.save })
  @ApiOkResponse({ schema: schemas.detail })
  async save(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await available(this.service).save(this.boundary.token(request), id, value) };
  }
  @Delete(':id')
  @ApiBody({ schema: schemas.remove })
  @ApiOkResponse({ schema: schemas.removed })
  async remove(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await available(this.service).remove(this.boundary.token(request), id, value) };
  }
  @Post(':id/slides')
  @ApiBody({ schema: schemas.slideCreate })
  @ApiCreatedResponse({ schema: schemas.detail })
  @ApiResponse({ status: 422, description: 'Presentation slide limit reached.' })
  async createSlide(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).createSlide(this.boundary.token(request), id, value),
    };
  }
  @Put(':id/order')
  @ApiBody({
    schema: schemas.order,
    description: 'Every current slide ID exactly once, in the desired order.',
  })
  @ApiOkResponse({ schema: schemas.detail })
  async reorder(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await available(this.service).reorder(this.boundary.token(request), id, value) };
  }
}

@Controller('slides')
@ApiTags('Presentations')
@ApiCookieAuth('staff')
@ApiResponse({ status: 428, description: 'Mutations require the slide expectedRevision.' })
@ApiResponse({ status: 409, description: 'Revision conflict, unready media or archived bot.' })
@UseGuards(StaffGuard)
export class SlidesController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(PRESENTATION_SERVICE) private readonly service: PresentationHttpService | null,
  ) {}
  @Patch(':id')
  @ApiBody({ schema: schemas.slideSave })
  @ApiOkResponse({ schema: schemas.detail })
  async save(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).saveSlide(this.boundary.token(request), id, value),
    };
  }
  @Delete(':id')
  @ApiBody({ schema: schemas.slideRemove })
  @ApiOkResponse({ schema: schemas.detail })
  async remove(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).removeSlide(this.boundary.token(request), id, value),
    };
  }
}

@Controller('bots/:botId/presentation')
@ApiTags('Presentations')
@ApiCookieAuth('staff')
@ApiResponse({ status: 428, description: 'Selection requires the bot expectedRevision.' })
@ApiResponse({ status: 409, description: 'Bot revision conflict or archived bot.' })
@UseGuards(StaffGuard)
export class BotPresentationController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(PRESENTATION_SERVICE) private readonly service: PresentationHttpService | null,
  ) {}
  @Put()
  @ApiBody({ schema: schemas.selection })
  @ApiOkResponse({ schema: schemas.selected })
  async select(
    @Req() request: Request,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).select(this.boundary.token(request), botId, value),
    };
  }
}
