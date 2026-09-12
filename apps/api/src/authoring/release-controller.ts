import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
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
  ApiHeader,
  ApiOkResponse,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ApiBodyOptions } from '@nestjs/swagger';
import type { Request } from 'express';
import { releaseListQuerySchema } from '@svara/contracts';
import { releaseApiSchemas } from '@svara/contracts/authoring-openapi';
import { IdentityError } from '@svara/domain';
import type { ReleaseService } from '@svara/domain';
import { AUTH_BOUNDARY } from '../auth/boundary.js';
import type { StaffBoundary } from '../auth/boundary.js';
import { StaffGuard } from '../auth/guard.js';

export const RELEASE_SERVICE = Symbol('release-service');
export type ReleaseHttpService = Pick<
  ReleaseService,
  'validate' | 'preview' | 'publish' | 'list' | 'get' | 'search'
>;
type ApiSchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];
const schemas = releaseApiSchemas as Record<keyof typeof releaseApiSchemas, ApiSchema>;
const idempotencyHeader = {
  name: 'Idempotency-Key',
  required: true,
  description:
    'Reuse for the same request after an uncertain response. Scoped by staff membership and operation for 24 hours.',
  schema: { type: 'string', minLength: 16, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' },
};
function available(service: ReleaseHttpService | null): ReleaseHttpService {
  if (!service) throw new ServiceUnavailableException();
  return service;
}

@Controller('bots/:botId')
@ApiTags('Releases')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
@ApiResponse({
  status: 409,
  description: 'Stale root revision, archived bot or idempotency key reused with another request.',
})
@ApiResponse({ status: 428, description: 'Capture requires expectedRevision and Idempotency-Key.' })
@ApiResponse({
  status: 422,
  description: 'Release is not ready. Field errors identify the selected content to correct.',
})
export class BotReleasesController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(RELEASE_SERVICE) private readonly service: ReleaseHttpService | null,
  ) {}
  @Get('releases')
  @ApiQuery({ name: 'kind', required: false, enum: ['ALL', 'PREVIEW', 'PUBLISHED'] })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, maximum: 1000 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiOkResponse({ schema: schemas.page })
  async list(
    @Req() request: Request,
    @Param('botId', ParseUUIDPipe) id: string,
    @Query() value: unknown,
  ) {
    const parsed = releaseListQuerySchema.safeParse(value);
    if (!parsed.success) throw new IdentityError('INVALID_INPUT');
    return {
      data: await available(this.service).list(this.boundary.token(request), id, parsed.data),
    };
  }
  @Post('releases/validate')
  @HttpCode(200)
  @ApiBody({ schema: schemas.create })
  @ApiOkResponse({
    schema: schemas.readiness,
    description:
      'Check the saved root draft revision without creating a release or calling a provider.',
  })
  async validate(
    @Req() request: Request,
    @Param('botId', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await available(this.service).validate(this.boundary.token(request), id, value),
    };
  }
  @Post('releases')
  @ApiHeader(idempotencyHeader)
  @ApiBody({ schema: schemas.create })
  @ApiCreatedResponse({
    schema: schemas.detail,
    description: 'Immutable published version, or the original version on an idempotent replay.',
  })
  async publish(
    @Req() request: Request,
    @Param('botId', ParseUUIDPipe) id: string,
    @Body() value: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return {
      data: await available(this.service).publish(this.boundary.token(request), id, value, key),
    };
  }
  @Post('preview')
  @ApiHeader(idempotencyHeader)
  @ApiBody({ schema: schemas.create })
  @ApiCreatedResponse({
    schema: schemas.detail,
    description:
      'Persist a staff-only snapshot with a 30-minute preview admission deadline. Selected draft knowledge is permitted.',
  })
  async preview(
    @Req() request: Request,
    @Param('botId', ParseUUIDPipe) id: string,
    @Body() value: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return {
      data: await available(this.service).preview(this.boundary.token(request), id, value, key),
    };
  }
}

@Controller('releases')
@ApiTags('Releases')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class ReleasesController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(RELEASE_SERVICE) private readonly service: ReleaseHttpService | null,
  ) {}
  @Get(':id')
  @ApiOkResponse({
    schema: schemas.detail,
    description:
      'Inspect a saved snapshot, including an expired preview. This does not admit a conversation.',
  })
  async get(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await available(this.service).get(this.boundary.token(request), id) };
  }
  @Post(':id/knowledge/query')
  @HttpCode(200)
  @ApiBody({
    schema: schemas.query,
    description:
      'English/Nepali query (1–500 characters, no NUL). Body transport keeps query text out of URLs.',
  })
  @ApiOkResponse({
    schema: schemas.search,
    description:
      'At most five passages and 6000 combined Unicode code points from this pinned release.',
  })
  @ApiResponse({
    status: 410,
    description:
      'The preview has expired for new query inspection. Historical snapshot reads remain available.',
  })
  async search(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await available(this.service).search(this.boundary.token(request), id, value) };
  }
}
