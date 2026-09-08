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
import { botListQuerySchema } from '@svara/contracts';
import { authoringApiSchemas } from '@svara/contracts/authoring-openapi';
import { IdentityError } from '@svara/domain';
import type { BotService } from '@svara/domain';
import { AUTH_BOUNDARY } from '../auth/boundary.js';
import type { StaffBoundary } from '../auth/boundary.js';
import { StaffGuard } from '../auth/guard.js';

export const BOT_SERVICE = Symbol('bot-service');
export type BotHttpService = Pick<BotService, 'create' | 'get' | 'list' | 'save' | 'archive'>;
type ApiSchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];
const schemas = authoringApiSchemas as Record<keyof typeof authoringApiSchemas, ApiSchema>;

@Controller('bots')
@ApiTags('Bot drafts')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class BotsController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(BOT_SERVICE) private readonly service: BotHttpService | null,
  ) {}
  private get bots(): BotHttpService {
    if (!this.service) throw new ServiceUnavailableException();
    return this.service;
  }
  @Post()
  @ApiBody({ schema: schemas.create })
  @ApiCreatedResponse({ schema: schemas.detail })
  async create(@Req() request: Request, @Body() data: unknown) {
    return { data: await this.bots.create(this.boundary.token(request), data) };
  }
  @Get()
  @ApiQuery({ name: 'search', required: false, type: String, maxLength: 120 })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, maximum: 1000 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiQuery({ name: 'includeArchived', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ schema: schemas.page })
  async list(@Req() request: Request, @Query() query: unknown) {
    const parsed = botListQuerySchema.safeParse(query);
    if (!parsed.success) throw new IdentityError('INVALID_INPUT');
    return { data: await this.bots.list(this.boundary.token(request), parsed.data) };
  }
  @Get(':id')
  @ApiOkResponse({ schema: schemas.detail })
  async get(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.bots.get(this.boundary.token(request), id) };
  }
  @Patch(':id')
  @ApiBody({ schema: schemas.save })
  @ApiOkResponse({ schema: schemas.detail })
  @ApiResponse({ status: 428, description: 'expectedRevision is required.' })
  @ApiResponse({
    status: 409,
    description: 'Revision conflict or archived bot. The error includes currentRevision.',
  })
  async save(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: unknown,
  ) {
    return { data: await this.bots.save(this.boundary.token(request), id, data) };
  }
  @Post(':id/archive')
  @HttpCode(200)
  @ApiBody({ schema: schemas.archive })
  @ApiOkResponse({ schema: schemas.detail })
  @ApiResponse({ status: 428, description: 'expectedRevision is required.' })
  @ApiResponse({
    status: 409,
    description: 'Revision conflict; reload the draft before archiving or restoring.',
  })
  async archive(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: unknown,
  ) {
    return { data: await this.bots.archive(this.boundary.token(request), id, data) };
  }
}
