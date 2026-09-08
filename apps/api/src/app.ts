import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Catch, Controller, Get, HttpException, Inject, Module, Res } from '@nestjs/common';
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
import type { ProviderMode } from '@svara/contracts';
import type { Readiness } from '@svara/domain';
import { createFeasibilityHandler } from './feasibility.js';

const OPTIONS = Symbol('application-options');
export interface ApplicationOptions {
  providerMode: ProviderMode;
  localDocs: boolean;
  probe: () => Promise<Readiness>;
  feasibilityOrigin?: string;
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
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : parserType === 'entity.too.large'
          ? 413
          : parserType === 'entity.parse.failed'
            ? 400
            : 500;
    const errors: Record<number, { code: string; message: string }> = {
      400: { code: 'INVALID_INPUT', message: 'The request is invalid.' },
      404: { code: 'NOT_FOUND', message: 'Resource not found.' },
      413: { code: 'PAYLOAD_TOO_LARGE', message: 'The request exceeds the allowed size.' },
    };
    response.status(status).json({
      error: {
        ...(errors[status] ?? {
          code: 'INTERNAL_ERROR',
          message: 'The request could not be completed.',
        }),
        fieldErrors: {},
        retryable: status >= 500,
      },
      requestId: response.getHeader('x-request-id'),
    });
    if (status >= 500)
      console.error(
        JSON.stringify({
          event: 'request.failed',
          status,
          requestId: response.getHeader('x-request-id'),
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
        'M0 process and dependency health contract. Business endpoints arrive in later milestones.',
      )
      .setVersion('0.1.0')
      .build(),
    { operationIdFactory: (_controller, method) => `health_${method}` },
  );
}

export async function createApplication(
  options: ApplicationOptions,
): Promise<NestExpressApplication> {
  @Module({ controllers: [HealthController], providers: [{ provide: OPTIONS, useValue: options }] })
  class AppModule {}
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('x-request-id', randomUUID());
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  if (options.localDocs && options.providerMode === 'fixture' && options.feasibilityOrigin) {
    app.useBodyParser('json', { limit: '16kb' });
    app
      .getHttpAdapter()
      .getInstance()
      .post('/api/v1/feasibility/turn', createFeasibilityHandler(options.feasibilityOrigin));
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
