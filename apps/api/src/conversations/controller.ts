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
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ApiBodyOptions } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { conversationApiSchemas } from '@svara/contracts/conversation-openapi';
import type { ConversationActor } from '@svara/domain';
import { AUTH_BOUNDARY } from '../auth/boundary.js';
import type { StaffBoundary } from '../auth/boundary.js';
import { StaffGuard } from '../auth/guard.js';
import { RUNTIME_BOUNDARY } from '../devices/boundary.js';
import type { DeviceRuntimeBoundary } from '../devices/boundary.js';
import { sendMediaFile } from '../media/send.js';
import { CONVERSATION_BOUNDARY } from './boundary.js';
import type { ConversationBoundary } from './boundary.js';
import { streamTurn } from './stream.js';

type ApiSchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];
const schemas = conversationApiSchemas as Record<keyof typeof conversationApiSchemas, ApiSchema>;
const streamed = ApiProduces('application/x-ndjson');
const turnDoc = ApiResponse({
  status: 200,
  description:
    'NDJSON turn events (protocol v1). 409 before streaming for an ended session, a stale generation or a repeated message.',
});

/** The same four session operations for every actor kind; only the credential differs. */
class Sessions {
  constructor(private readonly boundary: ConversationBoundary) {}
  admit(actor: ConversationActor, value: unknown) {
    return this.boundary.settings.service.admit(actor, value);
  }
  turn(response: Response, actor: ConversationActor, id: string, value: unknown) {
    return streamTurn(response, actor, id, value, this.boundary.settings.streaming);
  }
  async interrupt(actor: ConversationActor, id: string, value: unknown) {
    const session = await this.boundary.settings.service.interrupt(actor, id, value);
    this.boundary.settings.streaming.active.stop(id);
    return session;
  }
  async end(actor: ConversationActor, id: string) {
    const session = await this.boundary.settings.service.end(actor, id);
    this.boundary.settings.streaming.active.stop(id);
    return session;
  }
}

@Controller('voice-sessions')
@ApiTags('Conversations')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class VoiceSessionsController {
  private readonly sessions: Sessions;
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly staff: StaffBoundary,
    @Inject(CONVERSATION_BOUNDARY) boundary: ConversationBoundary,
  ) {
    this.sessions = new Sessions(boundary);
  }
  private actor(request: Request): ConversationActor {
    return { kind: 'STAFF', token: this.staff.token(request) };
  }
  @Post()
  @ApiBody({ schema: schemas.admit })
  @ApiCreatedResponse({ schema: schemas.admission })
  @ApiResponse({ status: 429, description: 'Concurrency or daily live allowance reached.' })
  async admit(@Req() request: Request, @Body() value: unknown) {
    return { data: await this.sessions.admit(this.actor(request), value) };
  }
  @Post(':id/turns')
  @ApiBody({ schema: schemas.turn })
  @streamed
  @turnDoc
  async turn(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    await this.sessions.turn(response, this.actor(request), id, value);
  }
  @Post(':id/interrupt')
  @HttpCode(200)
  @ApiBody({ schema: schemas.interrupt })
  @ApiOkResponse({ schema: schemas.session })
  async interrupt(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return { data: await this.sessions.interrupt(this.actor(request), id, value) };
  }
  @Post(':id/end')
  @HttpCode(200)
  @ApiOkResponse({ schema: schemas.session })
  async end(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.sessions.end(this.actor(request), id) };
  }
}

@Controller('runtime/voice-sessions')
@ApiTags('Device runtime')
@ApiCookieAuth('device')
export class RuntimeVoiceController {
  private readonly sessions: Sessions;
  constructor(
    @Inject(RUNTIME_BOUNDARY) private readonly device: DeviceRuntimeBoundary,
    @Inject(CONVERSATION_BOUNDARY) boundary: ConversationBoundary,
  ) {
    this.sessions = new Sessions(boundary);
  }
  private async actor(request: Request, response: Response): Promise<ConversationActor> {
    await this.device.authorize(request, response);
    return { kind: 'DEVICE', token: this.device.token(request) };
  }
  @Post()
  @ApiBody({ schema: schemas.admit })
  @ApiCreatedResponse({ schema: schemas.admission })
  @ApiResponse({ status: 409, description: 'NOT_READY until the desired release is applied.' })
  async admit(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() value: unknown,
  ) {
    return { data: await this.sessions.admit(await this.actor(request, response), value) };
  }
  @Post(':id/turns')
  @ApiBody({ schema: schemas.turn })
  @streamed
  @turnDoc
  async turn(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    await this.sessions.turn(response, await this.actor(request, response), id, value);
  }
  @Post(':id/interrupt')
  @HttpCode(200)
  @ApiBody({ schema: schemas.interrupt })
  @ApiOkResponse({ schema: schemas.session })
  async interrupt(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await this.sessions.interrupt(await this.actor(request, response), id, value),
    };
  }
  @Post(':id/end')
  @HttpCode(200)
  @ApiOkResponse({ schema: schemas.session })
  async end(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.sessions.end(await this.actor(request, response), id) };
  }
}

@Controller('public/assistants')
@ApiTags('Public assistant')
export class PublicAssistantsController {
  private readonly sessions: Sessions;
  constructor(@Inject(CONVERSATION_BOUNDARY) private readonly boundary: ConversationBoundary) {
    this.sessions = new Sessions(boundary);
  }
  private async actor(
    request: Request,
    response: Response,
    slug: string,
  ): Promise<ConversationActor> {
    await this.boundary.authorizeVisitor(request, response);
    return { kind: 'VISITOR', slug, token: this.boundary.visitorToken(request) };
  }
  @Get(':slug')
  @ApiOkResponse({ schema: schemas.publicAssistant })
  @ApiResponse({ status: 404, description: 'Unknown, disabled and expired links look the same.' })
  async config(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('slug') slug: string,
  ) {
    await this.boundary.authorizeVisitor(request, response);
    return { data: await this.boundary.settings.publics.config(slug) };
  }
  @Post(':slug/grants')
  @ApiCreatedResponse({
    schema: schemas.grant,
    description: 'Sets the HttpOnly visitor cookie and returns only its CSRF token.',
  })
  @ApiResponse({ status: 429, description: 'At most ten grants per IP per minute.' })
  async grant(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('slug') slug: string,
  ) {
    await this.boundary.authorizeVisitor(request, response, true);
    const grant = await this.boundary.settings.publics.grant(slug);
    this.boundary.issueVisitor(response, grant.token, grant.expiresAt);
    return { data: { csrfToken: grant.csrfToken, expiresAt: grant.expiresAt.toISOString() } };
  }
  @Get(':slug/media/:id/content')
  @ApiProduces('image/png', 'image/jpeg', 'video/mp4')
  @ApiResponse({ status: 404, description: 'Not referenced by this link’s release.' })
  async media(
    @Req() request: Request,
    @Res() response: Response,
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.boundary.authorizeVisitor(request, response);
    await sendMediaFile(
      request,
      response,
      id,
      await this.boundary.settings.publics.media(slug, id),
    );
  }
  @Post(':slug/voice-sessions')
  @ApiBody({ schema: schemas.admit })
  @ApiCreatedResponse({ schema: schemas.admission })
  async admit(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('slug') slug: string,
    @Body() value: unknown,
  ) {
    return { data: await this.sessions.admit(await this.actor(request, response, slug), value) };
  }
  @Post(':slug/voice-sessions/:id/turns')
  @ApiBody({ schema: schemas.turn })
  @streamed
  @turnDoc
  async turn(
    @Req() request: Request,
    @Res() response: Response,
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    await this.sessions.turn(response, await this.actor(request, response, slug), id, value);
  }
  @Post(':slug/voice-sessions/:id/interrupt')
  @HttpCode(200)
  @ApiBody({ schema: schemas.interrupt })
  @ApiOkResponse({ schema: schemas.session })
  async interrupt(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    const actor = await this.actor(request, response, slug);
    return { data: await this.sessions.interrupt(actor, id, value) };
  }
  @Post(':slug/voice-sessions/:id/end')
  @HttpCode(200)
  @ApiOkResponse({ schema: schemas.session })
  async end(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.sessions.end(await this.actor(request, response, slug), id) };
  }
}

@Controller('sessions')
@ApiTags('Conversations')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class SessionsController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly staff: StaffBoundary,
    @Inject(CONVERSATION_BOUNDARY) private readonly boundary: ConversationBoundary,
  ) {}
  @Get()
  @ApiQuery({ name: 'cursor', type: String, format: 'uuid', required: false })
  @ApiQuery({ name: 'limit', type: Number, minimum: 1, maximum: 100, required: false })
  @ApiQuery({ name: 'actorKind', enum: ['STAFF', 'DEVICE', 'VISITOR'], required: false })
  @ApiQuery({ name: 'status', enum: ['ACTIVE', 'ENDED'], required: false })
  @ApiOkResponse({ schema: schemas.sessions })
  async list(@Req() request: Request, @Query() value: unknown) {
    const page = await this.boundary.settings.sessions.list(this.staff.token(request), value);
    return { data: page.items, page: { nextCursor: page.nextCursor } };
  }
  @Get(':id')
  @ApiOkResponse({ schema: schemas.sessionDetail })
  async get(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.boundary.settings.sessions.get(this.staff.token(request), id) };
  }
  @Delete(':id')
  @ApiOkResponse({
    schema: schemas.sessionDetail,
    description: 'Removes transcript text, citations and tool payloads; owners and administrators.',
  })
  async remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.boundary.settings.sessions.deleteTranscript(this.staff.token(request), id),
    };
  }
}

@Controller('analytics')
@ApiTags('Conversations')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class AnalyticsController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly staff: StaffBoundary,
    @Inject(CONVERSATION_BOUNDARY) private readonly boundary: ConversationBoundary,
  ) {}
  @Get('overview')
  @ApiQuery({ name: 'mode', enum: ['live', 'fixture'], required: false })
  @ApiQuery({ name: 'locale', enum: ['en-US', 'ne-NP'], required: false })
  @ApiQuery({ name: 'days', type: Number, minimum: 1, maximum: 90, required: false })
  @ApiOkResponse({
    schema: schemas.analyticsOverview,
    description: 'Recorded counts for exactly one provider mode; live is the default.',
  })
  async overview(@Req() request: Request, @Query() value: unknown) {
    return {
      data: await this.boundary.settings.sessions.overview(this.staff.token(request), value),
    };
  }
  @Get('latency')
  @ApiQuery({ name: 'mode', enum: ['live', 'fixture'], required: false })
  @ApiQuery({ name: 'locale', enum: ['en-US', 'ne-NP'], required: false })
  @ApiQuery({ name: 'days', type: Number, minimum: 1, maximum: 90, required: false })
  @ApiOkResponse({
    schema: schemas.analyticsLatency,
    description: 'Measured distributions; percentiles are null below the minimum sample size.',
  })
  async latency(@Req() request: Request, @Query() value: unknown) {
    return {
      data: await this.boundary.settings.sessions.latency(this.staff.token(request), value),
    };
  }
}

@Controller('assistant-links')
@ApiTags('Public assistant')
@ApiCookieAuth('staff')
@UseGuards(StaffGuard)
export class AssistantLinksController {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly staff: StaffBoundary,
    @Inject(CONVERSATION_BOUNDARY) private readonly boundary: ConversationBoundary,
  ) {}
  @Get()
  @ApiOkResponse({ schema: schemas.links })
  async list(@Req() request: Request) {
    return { data: await this.boundary.settings.links.list(this.staff.token(request)) };
  }
  @Post()
  @ApiBody({ schema: schemas.linkCreate })
  @ApiCreatedResponse({ schema: schemas.link })
  async create(@Req() request: Request, @Body() value: unknown) {
    return { data: await this.boundary.settings.links.create(this.staff.token(request), value) };
  }
  @Patch(':id')
  @ApiBody({ schema: schemas.linkSave })
  @ApiOkResponse({ schema: schemas.link })
  @ApiResponse({ status: 428, description: 'expectedRevision is required.' })
  @ApiResponse({
    status: 409,
    description: 'The link changed; the error includes currentRevision.',
  })
  async save(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return {
      data: await this.boundary.settings.links.save(this.staff.token(request), id, value),
    };
  }
}
