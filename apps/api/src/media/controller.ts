import { pipeline } from 'node:stream/promises';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ApiBodyOptions } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { mediaListQuerySchema } from '@svara/contracts';
import { mediaApiSchemas } from '@svara/contracts/authoring-openapi';
import { IdentityError, parseMediaRange } from '@svara/domain';
import type { MediaService } from '@svara/domain';
import { AUTH_BOUNDARY } from '../auth/boundary.js';
import type { StaffBoundary } from '../auth/boundary.js';
import { MultipartStaff, StaffGuard } from '../auth/guard.js';
import { receiveMultipart } from './upload.js';

export const MEDIA_SERVICE = Symbol('media-service');
export type MediaHttpService = Pick<
  MediaService,
  'reserve' | 'receive' | 'list' | 'get' | 'remove' | 'file'
>;
type ApiSchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];
const schemas = mediaApiSchemas as Record<keyof typeof mediaApiSchemas, ApiSchema>;
const binary = { type: 'string', format: 'binary' };

@Controller('media')
@ApiTags('Media')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class MediaController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(MEDIA_SERVICE) private readonly service: MediaHttpService | null,
  ) {}
  private available(): MediaHttpService {
    if (!this.service) throw new ServiceUnavailableException();
    return this.service;
  }
  @Get()
  @ApiQuery({ name: 'search', required: false, type: String, maxLength: 160 })
  @ApiQuery({
    name: 'state',
    required: false,
    enum: [
      'ALL',
      'UPLOADING',
      'RECEIVING',
      'QUARANTINED',
      'INSPECTING',
      'READY',
      'REJECTED',
      'DELETING',
    ],
  })
  @ApiQuery({ name: 'kind', required: false, enum: ['ALL', 'IMAGE', 'VIDEO'] })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, maximum: 1000 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiOkResponse({ schema: schemas.page })
  async list(@Req() request: Request, @Query() query: unknown) {
    const parsed = mediaListQuerySchema.safeParse(query);
    if (!parsed.success) throw new IdentityError('INVALID_INPUT');
    return { data: await this.available().list(this.boundary.token(request), parsed.data) };
  }
  @Post()
  @MultipartStaff()
  @HttpCode(202)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['metadata', 'file'],
      additionalProperties: false,
      properties: {
        metadata: {
          type: 'string',
          maxLength: 2048,
          description:
            'First part: JSON with filename (up to 160 characters), mimeType (image/jpeg, image/png or video/mp4) and exact byteLength. Images up to 10 MiB, videos up to 50 MiB.',
        },
        file: binary,
      },
    },
  })
  @ApiAcceptedResponse({
    schema: schemas.detail,
    description: 'Private upload received; inspection is pending.',
  })
  @ApiResponse({ status: 422, description: 'Uploaded byte count differs from metadata.' })
  @ApiResponse({ status: 429, description: 'Organisation media budget or request quota reached.' })
  async upload(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return {
      data: await receiveMultipart(
        request,
        response,
        this.available(),
        this.boundary.token(request),
      ),
    };
  }
  @Get(':id')
  @ApiOkResponse({ schema: schemas.detail })
  async get(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.available().get(this.boundary.token(request), id) };
  }
  @Delete(':id')
  @ApiBody({ schema: schemas.remove })
  @ApiOkResponse({ schema: schemas.removed })
  @ApiResponse({ status: 428, description: 'Deletion requires expectedRevision.' })
  @ApiResponse({ status: 409, description: 'Revision changed or processing is busy.' })
  async remove(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await this.available().remove(this.boundary.token(request), id, value) };
  }
  @Get(':id/content')
  @ApiProduces('image/png', 'image/jpeg', 'video/mp4')
  @ApiOkResponse({ schema: binary })
  @ApiResponse({ status: 206, schema: binary, description: 'One byte range of the ready object.' })
  @ApiResponse({
    status: 416,
    description: 'Invalid or unsatisfiable range; Content-Range reports the object size.',
  })
  @ApiResponse({ status: 409, description: 'Media is not ready.' })
  async content(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.serve(request, response, id, false);
  }
  @Get(':id/thumbnail')
  @ApiProduces('image/png')
  @ApiOkResponse({ schema: binary })
  async thumbnail(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.serve(request, response, id, true);
  }
  private async serve(request: Request, response: Response, id: string, thumbnail: boolean) {
    const file = await this.available().file(this.boundary.token(request), id, thumbnail);
    try {
      const etag = `"${file.sha256}"`;
      const requested =
        !request.headers['if-range'] || request.headers['if-range'] === etag
          ? request.headers.range
          : undefined;
      response.setHeader('Content-Range', `bytes */${file.byteLength}`);
      const range = parseMediaRange(requested, file.byteLength);
      response.removeHeader('Content-Range');
      response.status(range.partial ? 206 : 200);
      response.setHeader('Content-Type', file.mimeType);
      response.setHeader('Content-Length', String(range.end - range.start + 1));
      response.setHeader('ETag', etag);
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      const name = encodeURIComponent(file.filename).replace(
        /[!'()*]/g,
        (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      response.setHeader(
        'Content-Disposition',
        `inline; filename="media"; filename*=UTF-8''${name}`,
      );
      if (range.partial)
        response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.byteLength}`);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      try {
        await pipeline(
          file.handle.createReadStream({ start: range.start, end: range.end, autoClose: true }),
          response,
        );
      } catch {
        // The response may already have streamed bytes; never append an error envelope.
        if (!response.destroyed) response.destroy();
        console.error(JSON.stringify({ event: 'media.response.interrupted', assetId: id }));
      }
    } finally {
      await file.handle.close();
    }
  }
}
