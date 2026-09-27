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
  Res,
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
import type { Request, Response } from 'express';
import { deviceListQuerySchema, devicePairHttpSchema } from '@svara/contracts';
import { deviceApiSchemas } from '@svara/contracts/authoring-openapi';
import { DeviceError } from '@svara/domain';
import type { DeviceService } from '@svara/domain';
import { AUTH_BOUNDARY } from '../auth/boundary.js';
import type { StaffBoundary } from '../auth/boundary.js';
import { StaffGuard } from '../auth/guard.js';
import { RUNTIME_BOUNDARY } from './boundary.js';
import type { DeviceRuntimeBoundary } from './boundary.js';

export const DEVICE_SERVICE = Symbol('device-service');
export type DeviceHttpService = Pick<
  DeviceService,
  'create' | 'get' | 'list' | 'save' | 'createPairing' | 'revoke'
>;
type ApiSchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];
const schemas = deviceApiSchemas as Record<keyof typeof deviceApiSchemas, ApiSchema>;

@Controller('devices')
@ApiTags('Devices')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class DevicesController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(DEVICE_SERVICE) private readonly service: DeviceHttpService | null,
  ) {}
  private get devices(): DeviceHttpService {
    if (!this.service) throw new ServiceUnavailableException();
    return this.service;
  }
  @Post()
  @ApiBody({ schema: schemas.create })
  @ApiCreatedResponse({ schema: schemas.detail })
  async create(@Req() request: Request, @Body() value: unknown) {
    return { data: await this.devices.create(this.boundary.token(request), value) };
  }
  @Get()
  @ApiQuery({ name: 'search', type: String, maxLength: 120, required: false })
  @ApiQuery({ name: 'cursor', type: String, format: 'uuid', required: false })
  @ApiQuery({ name: 'limit', type: Number, minimum: 1, maximum: 100, required: false })
  @ApiOkResponse({ schema: schemas.page })
  async list(@Req() request: Request, @Query() value: unknown) {
    const query = deviceListQuerySchema.safeParse(value);
    if (!query.success) throw new DeviceError('INVALID_INPUT');
    const page = await this.devices.list(this.boundary.token(request), query.data);
    return { data: page.items, page: { nextCursor: page.nextCursor } };
  }
  @Get(':id')
  @ApiOkResponse({ schema: schemas.detail })
  async get(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.devices.get(this.boundary.token(request), id) };
  }
  @Patch(':id')
  @ApiBody({ schema: schemas.save })
  @ApiOkResponse({ schema: schemas.detail })
  @ApiResponse({ status: 428, description: 'expectedRevision is required.' })
  @ApiResponse({ status: 409, description: 'The device configuration has changed.' })
  async save(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await this.devices.save(this.boundary.token(request), id, value) };
  }
  @Post(':id/pairing')
  @ApiBody({ schema: schemas.revision })
  @ApiCreatedResponse({ schema: schemas.pairing })
  @ApiResponse({ status: 409, description: 'The device is disabled or its revision has changed.' })
  async pairing(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await this.devices.createPairing(this.boundary.token(request), id, value) };
  }
  @Post(':id/revoke')
  @HttpCode(200)
  @ApiBody({ schema: schemas.revision })
  @ApiOkResponse({ schema: schemas.detail })
  async revoke(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await this.devices.revoke(this.boundary.token(request), id, value) };
  }
}

@Controller('runtime')
@ApiTags('Device runtime')
export class DeviceRuntimeController {
  constructor(@Inject(RUNTIME_BOUNDARY) private readonly boundary: DeviceRuntimeBoundary) {}
  @Post('pair')
  @ApiBody({ schema: schemas.pair })
  @ApiCreatedResponse({ schema: schemas.identity })
  @ApiResponse({
    status: 409,
    description: 'Confirm replacement of this browser profile’s pairing.',
  })
  @ApiResponse({ status: 429, description: 'At most ten pairing attempts per IP per minute.' })
  async pair(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() value: unknown,
  ) {
    await this.boundary.authorize(request, response, true);
    const parsed = devicePairHttpSchema.safeParse(value);
    if (!parsed.success) throw new DeviceError('INVALID_INPUT');
    const { replaceExisting, ...input } = parsed.data;
    if (this.boundary.optionalToken(request) && !replaceExisting)
      throw new DeviceError('PAIRING_REPLACEMENT_REQUIRED');
    const result = await this.boundary.settings.service.pair(input);
    this.boundary.issue(response, result.token);
    return { data: { device: result.device, csrfToken: this.boundary.csrf(result.token) } };
  }
  @Get('device')
  @ApiCookieAuth('device')
  @ApiOkResponse({ schema: schemas.identity })
  async device(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.boundary.authorize(request, response);
    const token = this.boundary.token(request);
    const device = await this.boundary.settings.service.identity(token);
    return { data: { device, csrfToken: this.boundary.csrf(token) } };
  }
  @Post('tickets')
  @ApiCookieAuth('device')
  @ApiBody({ schema: schemas.ticket })
  @ApiCreatedResponse({ schema: schemas.ticketResult })
  @ApiResponse({ status: 429, description: 'Too many outstanding unconsumed tickets.' })
  async tickets(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() value: unknown,
  ) {
    await this.boundary.authorize(request, response);
    return {
      data: await this.boundary.settings.service.issueTicket(this.boundary.token(request), value),
    };
  }
}
