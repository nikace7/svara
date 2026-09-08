import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Catch,
  Controller,
  Get,
  HttpException,
  Inject,
  Module,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ApiOkResponse,
  ApiProperty,
  ApiResponse,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { mediaRejectionMessages } from '@svara/contracts';
import type { ProviderMode } from '@svara/contracts';
import type { Readiness } from '@svara/domain';
import { AuthoringError, IdentityError, MediaError } from '@svara/domain';
import { MEDIA_SERVICE, MediaController } from './media/controller.js';
import type { MediaHttpService } from './media/controller.js';
import { createFeasibilityHandler } from './feasibility.js';
import { AUTH_BOUNDARY, StaffBoundary } from './auth/boundary.js';
import type { IdentityHttpOptions } from './auth/boundary.js';
import { AuthController, MembersController, OrganisationController } from './auth/controller.js';
import { StaffGuard } from './auth/guard.js';
import { BOT_SERVICE, BotsController } from './authoring/controller.js';
import type { BotHttpService } from './authoring/controller.js';
import {
  BotKnowledgeController,
  KnowledgeController,
  KNOWLEDGE_SERVICE,
} from './authoring/knowledge-controller.js';
import type { KnowledgeHttpService } from './authoring/knowledge-controller.js';

const OPTIONS = Symbol('application-options');
export interface ApplicationOptions {
  providerMode: ProviderMode;
  localDocs: boolean;
  probe: () => Promise<Readiness>;
  feasibilityOrigin?: string;
  identity?: IdentityHttpOptions;
  authoring?: BotHttpService;
  knowledge?: KnowledgeHttpService;
  media?: MediaHttpService;
  trustedProxyHops?: 0 | 1;
}

class HealthData {
  @ApiProperty({ enum: ['ok', 'ready', 'unavailable'] })
  status!: 'ok' | 'ready' | 'unavailable';
  @ApiProperty({ enum: ['api'] })
  service!: 'api';
  @ApiProperty({ enum: ['fixture', 'live'] })
  providerMode!: ProviderMode;
  @ApiProperty({
    selfRequired: false,
    type: 'object',
    additionalProperties: { type: 'string', enum: ['ready', 'unavailable'] },
  })
  dependencies?: Record<string, 'ready' | 'unavailable'>;
}

class HealthResponse {
  @ApiProperty({ type: HealthData })
  data!: HealthData;
}

@Controller('health')
class HealthController {
  constructor(@Inject(OPTIONS) private readonly options: ApplicationOptions) {}

  @Get('live')
  @ApiOkResponse({ type: HealthResponse, description: 'The API process is running.' })
  live(): HealthResponse {
    return { data: { status: 'ok', service: 'api', providerMode: this.options.providerMode } };
  }

  @Get('ready')
  @ApiOkResponse({
    type: HealthResponse,
    description: 'Local dependencies and worker heartbeat are ready.',
  })
  @ApiResponse({
    status: 503,
    type: HealthResponse,
    description: 'At least one dependency is unavailable.',
  })
  async ready(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const readiness = await this.options.probe();
    response.status(readiness.status === 'ready' ? 200 : 503);
    return { data: { ...readiness, service: 'api', providerMode: this.options.providerMode } };
  }
}

@Catch()
class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const parserType =
      exception instanceof Error && 'type' in exception ? exception.type : undefined;
    if (exception instanceof MediaError) {
      const codes = {
        MEDIA_BUSY: [409, 'This file is being processed. Wait and refresh before trying again.'],
        MEDIA_NOT_READY: [409, 'This file is not ready for playback.'],
        MEDIA_QUOTA: [
          429,
          'The media library limit has been reached. Remove unused files or wait for pending uploads.',
        ],
        INVALID_RANGE: [416, 'The requested byte range is invalid.'],
      } as const;
      const detail =
        exception.code in codes ? codes[exception.code as keyof typeof codes] : undefined;
      const status = detail?.[0] ?? 422;
      response.status(status).json({
        error: {
          code: exception.code,
          message:
            detail?.[1] ??
            mediaRejectionMessages[exception.code as keyof typeof mediaRejectionMessages],
          fieldErrors: {},
          retryable: exception.code === 'MEDIA_BUSY' || exception.code === 'MEDIA_NOT_READY',
        },
        requestId: response.getHeader('x-request-id'),
      });
      return;
    }
    if (exception instanceof AuthoringError) {
      const details = {
        PRECONDITION_REQUIRED: {
          status: 428,
          message: 'Include the draft revision before saving.',
        },
        REVISION_CONFLICT: {
          status: 409,
          message:
            'This draft changed elsewhere. Your edits have not been saved. Load the latest version before trying again.',
        },
        ARCHIVED: { status: 409, message: 'Restore this bot before editing its draft.' },
        INCOMPLETE_TRANSLATIONS: {
          status: 422,
          message: 'Complete both languages before approving this entry.',
        },
      }[exception.code];
      response.status(details.status).json({
        error: {
          code: exception.code,
          message: details.message,
          currentRevision: exception.currentRevision,
          fieldErrors: exception.fieldErrors,
          retryable: false,
        },
        requestId: response.getHeader('x-request-id'),
      });
      return;
    }
    const status =
      exception instanceof IdentityError
        ? (
            {
              INVALID_INPUT: 400,
              UNAUTHENTICATED: 401,
              FORBIDDEN: 403,
              NOT_FOUND: 404,
              CONFLICT: 409,
              LAST_OWNER: 409,
              INVALID_LINK: 400,
            } as const
          )[exception.code]
        : exception instanceof HttpException
          ? exception.getStatus()
          : parserType === 'entity.too.large'
            ? 413
            : parserType === 'entity.parse.failed'
              ? 400
              : 500;
    const errors: Record<number, { code: string; message: string }> = {
      400: { code: 'INVALID_INPUT', message: 'The request is invalid.' },
      401: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
      403: { code: 'FORBIDDEN', message: 'You do not have access to this action.' },
      404: { code: 'NOT_FOUND', message: 'Resource not found.' },
      409: {
        code: 'CONFLICT',
        message: 'This change conflicts with existing access. Refresh and try again.',
      },
      413: { code: 'PAYLOAD_TOO_LARGE', message: 'The request exceeds the allowed size.' },
      429: { code: 'RATE_LIMITED', message: 'Too many requests. Wait before trying again.' },
      503: {
        code: 'UNAVAILABLE',
        message: 'The service is temporarily unavailable. Try again shortly.',
      },
    };
    const detail = exception instanceof HttpException ? exception.getResponse() : null;
    const fields =
      detail && typeof detail === 'object' && 'fieldErrors' in detail ? detail.fieldErrors : {};
    const specific =
      exception instanceof IdentityError && exception.code === 'LAST_OWNER'
        ? { code: 'LAST_OWNER', message: 'Keep at least one enabled owner in this organisation.' }
        : exception instanceof IdentityError && exception.code === 'INVALID_LINK'
          ? {
              code: 'INVALID_LINK',
              message: 'This link is expired, already used or no longer available.',
            }
          : errors[status];
    response.status(status).json({
      error: {
        ...(specific ?? {
          code: 'INTERNAL_ERROR',
          message: 'The request could not be completed.',
        }),
        fieldErrors: fields,
        retryable: status === 429 || status >= 500,
      },
      requestId: response.getHeader('x-request-id'),
    });
    if (status >= 500)
      console.error(
        JSON.stringify({
          event: 'request.failed',
          status,
          requestId: response.getHeader('x-request-id'),
          ...(exception instanceof Error &&
          'code' in exception &&
          typeof exception.code === 'string' &&
          /^P[0-9]{4}$/.test(exception.code)
            ? { databaseCode: exception.code }
            : {}),
        }),
      );
  }
}

export function createOpenApiDocument(app: NestExpressApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Svara API')
      .setDescription(
        'Staff identity, organisation access, bot drafts and process/dependency health. Mutations require the configured Origin and authenticated mutations also require X-CSRF-Token. Draft updates require expectedRevision.',
      )
      .setVersion('0.1.0')
      .addCookieAuth(
        'svara-session',
        {
          type: 'apiKey',
          in: 'cookie',
          description: 'Host-only staff cookie; __Host-svara-session on HTTPS.',
        },
        'staff',
      )
      .build(),
    {
      operationIdFactory: (controller, method) =>
        `${controller.replace('Controller', '').toLowerCase()}_${method}`,
    },
  );
}

export async function createApplication(
  options: ApplicationOptions,
): Promise<NestExpressApplication> {
  const boundary = new StaffBoundary(options.identity);
  @Module({
    controllers: [
      HealthController,
      AuthController,
      MembersController,
      OrganisationController,
      BotsController,
      BotKnowledgeController,
      KnowledgeController,
      MediaController,
    ],
    providers: [
      { provide: OPTIONS, useValue: options },
      { provide: AUTH_BOUNDARY, useValue: boundary },
      { provide: BOT_SERVICE, useValue: options.authoring ?? null },
      { provide: KNOWLEDGE_SERVICE, useValue: options.knowledge ?? null },
      { provide: MEDIA_SERVICE, useValue: options.media ?? null },
      StaffGuard,
    ],
  })
  class AppModule {}
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustedProxyHops ?? false);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('x-request-id', randomUUID());
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Full bilingual drafts can exceed 16 KiB; other JSON routes keep their smaller limit.
  app.useBodyParser('json', {
    limit: '64kb',
    type: (request) =>
      /^\/api\/v1\/(?:bots|knowledge)(?:\/|\?|$)/.test(request.url ?? '') &&
      /^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? ''),
  });
  app.useBodyParser('json', { limit: '16kb' });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new BadRequestException({
          fieldErrors: Object.fromEntries(
            errors.map((error) => [error.property, ['Check this field.']]),
          ),
        }),
    }),
  );
  if (
    options.localDocs &&
    options.providerMode === 'fixture' &&
    options.feasibilityOrigin &&
    options.identity
  ) {
    const handler = createFeasibilityHandler(options.feasibilityOrigin, (request) =>
      boundary.settings.service.resolve(boundary.token(request), false),
    );
    app
      .getHttpAdapter()
      .getInstance()
      .post(
        '/api/v1/feasibility/turn',
        async (request: Request, response: Response, next: NextFunction) => {
          try {
            await boundary.authorize(request, response);
            await handler(request, response);
          } catch (error) {
            next(error);
          }
        },
      );
  }
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new SafeExceptionFilter());
  const document = createOpenApiDocument(app);
  app.use('/api/openapi.json', (request: Request, response: Response, next: NextFunction) => {
    if (request.method === 'GET') response.json(document);
    else next();
  });
  if (options.localDocs)
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: '/api/openapi.json' });
  return app;
}
