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

const OPTIONS = Symbol('application-options');
export interface ApplicationOptions {
  providerMode: ProviderMode;
  localDocs: boolean;
  probe: () => Promise<Readiness>;
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
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    response.status(status).json({
      error: {
        code: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: status === 404 ? 'Resource not found.' : 'The request could not be completed.',
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
