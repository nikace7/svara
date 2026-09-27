import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { csrfToken, DeviceError, IdentityError, verifyCsrf } from '@svara/domain';
import type { DeviceRuntime } from '@svara/domain';
import type { Request, Response } from 'express';
import { readSessionToken } from '../auth/boundary.js';
import type { IdentityHttpOptions } from '../auth/boundary.js';

export const RUNTIME_BOUNDARY = Symbol('device-runtime-boundary');
export interface DeviceRuntimeHttpOptions {
  service: Pick<DeviceRuntime, 'identity' | 'pair' | 'issueTicket'>;
  origin: string;
  pepper: string;
  consumeLimit: IdentityHttpOptions['consumeLimit'];
}
export function deviceCookieName(origin: string): string {
  return new URL(origin).protocol === 'https:' ? '__Host-svara-device' : 'svara-device';
}

export class DeviceRuntimeBoundary {
  constructor(private readonly options: DeviceRuntimeHttpOptions | undefined) {}
  get settings(): DeviceRuntimeHttpOptions {
    if (!this.options) throw new ServiceUnavailableException();
    return this.options;
  }
  optionalToken(request: Request): string | undefined {
    return readSessionToken(request.headers.cookie, deviceCookieName(this.settings.origin));
  }
  token(request: Request): string {
    const token = this.optionalToken(request);
    if (!token) throw new DeviceError('DEVICE_UNAUTHENTICATED');
    return token;
  }
  csrf(token: string): string {
    return csrfToken(token, this.settings.pepper);
  }
  async authorize(request: Request, response: Response, pairing = false): Promise<void> {
    const { origin } = this.settings;
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (
      request.headers.host !== new URL(origin).host ||
      (request.get('origin') !== undefined && request.get('origin') !== origin) ||
      (mutation && request.get('origin') !== origin)
    )
      throw new IdentityError('FORBIDDEN');
    if (mutation && !request.is('application/json')) throw new DeviceError('INVALID_INPUT');
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    await this.limit(response, 'runtime-ip', ip, 300, 60000);
    if (pairing) {
      await this.limit(response, 'pairing-ip', ip, 10, 60000);
      return;
    }
    const token = this.token(request);
    await this.limit(response, 'runtime-credential', token, 180, 60000);
    if (mutation && !verifyCsrf(token, request.get('x-csrf-token') ?? '', this.settings.pepper))
      throw new IdentityError('FORBIDDEN');
  }
  private async limit(
    response: Response,
    bucket: string,
    key: string,
    maximum: number,
    windowMs: number,
  ): Promise<void> {
    let wait: number;
    try {
      wait = await this.settings.consumeLimit(bucket, key, maximum, windowMs);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (wait > 0) {
      response.setHeader('Retry-After', String(wait));
      throw new HttpException('RATE_LIMITED', 429);
    }
  }
  issue(response: Response, token: string): void {
    response.cookie(deviceCookieName(this.settings.origin), token, {
      httpOnly: true,
      secure: new URL(this.settings.origin).protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
