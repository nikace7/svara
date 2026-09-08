import {
  Body,
  Controller,
  Delete,
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
import { knowledgeListQuerySchema } from '@svara/contracts';
import { knowledgeApiSchemas } from '@svara/contracts/authoring-openapi';
import { IdentityError } from '@svara/domain';
import type { KnowledgeService } from '@svara/domain';
import { AUTH_BOUNDARY } from '../auth/boundary.js';
import type { StaffBoundary } from '../auth/boundary.js';
import { StaffGuard } from '../auth/guard.js';

export const KNOWLEDGE_SERVICE = Symbol('knowledge-service');
export type KnowledgeHttpService = Pick<
  KnowledgeService,
  'create' | 'list' | 'get' | 'save' | 'approve' | 'select' | 'remove'
>;
type ApiSchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];
const schemas = knowledgeApiSchemas as Record<keyof typeof knowledgeApiSchemas, ApiSchema>;
function available(service: KnowledgeHttpService | null): KnowledgeHttpService {
  if (!service) throw new ServiceUnavailableException();
  return service;
}

@Controller('bots/:botId/knowledge')
@ApiTags('Knowledge')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class BotKnowledgeController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(KNOWLEDGE_SERVICE) private readonly service: KnowledgeHttpService | null,
  ) {}
  @Get()
  @ApiQuery({ name: 'search', required: false, type: String, maxLength: 160 })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, maximum: 1000 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiQuery({ name: 'status', required: false, enum: ['ALL', 'DRAFT', 'APPROVED'] })
  @ApiQuery({ name: 'type', required: false, enum: ['ALL', 'FAQ', 'NOTE'] })
  @ApiOkResponse({ schema: schemas.page })
  async list(
    @Req() request: Request,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Query() query: unknown,
  ) {
    const parsed = knowledgeListQuerySchema.safeParse(query);
    if (!parsed.success) throw new IdentityError('INVALID_INPUT');
    return {
      data: await available(this.service).list(this.boundary.token(request), botId, parsed.data),
    };
  }
  @Post()
  @ApiBody({ schema: schemas.create })
  @ApiCreatedResponse({ schema: schemas.detail })
  async create(
    @Req() request: Request,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).create(this.boundary.token(request), botId, value),
    };
  }
}

@Controller('knowledge')
@ApiTags('Knowledge')
@ApiCookieAuth('staff')
@ApiResponse({ status: 428, description: 'Mutations require expectedRevision.' })
@ApiResponse({ status: 409, description: 'Revision conflict or archived parent bot.' })
@UseGuards(StaffGuard)
export class KnowledgeController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(KNOWLEDGE_SERVICE) private readonly service: KnowledgeHttpService | null,
  ) {}
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
  @Post(':id/approval')
  @HttpCode(200)
  @ApiBody({ schema: schemas.approval })
  @ApiOkResponse({ schema: schemas.detail })
  @ApiResponse({
    status: 422,
    description: 'Missing bilingual content; fieldErrors identify the content/question and locale.',
  })
  async approve(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await available(this.service).approve(this.boundary.token(request), id, value) };
  }
  @Post(':id/selection')
  @HttpCode(200)
  @ApiBody({ schema: schemas.selection })
  @ApiOkResponse({ schema: schemas.detail })
  async select(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await available(this.service).select(this.boundary.token(request), id, value) };
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
}
