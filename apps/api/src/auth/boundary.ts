import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { csrfToken, IdentityError, verifyCsrf } from '@svara/domain';
import type { IdentityService, IssuedSession, SafeIdentity } from '@svara/domain';
import type { Request, Response } from 'express';

export const AUTH_BOUNDARY = Symbol('staff-http-boundary');
export interface IdentityHttpOptions {
  service: Pick<
    IdentityService,
    | 'register'
    | 'login'
    | 'resolve'
    | 'logout'
    | 'switchOrganisation'
    | 'listMembers'
    | 'updateMember'
    | 'updateOrganisation'
    | 'invite'
    | 'issueRecovery'
    | 'activate'
    | 'recover'
  >;
  origin: string;
  pepper: string;
  consumeLimit: (bucket: string, key: string, limit: number, windowMs: number) => Promise<number>;
}

export function sessionCookieName(origin: string): string {
  return new URL(origin).protocol === 'https:' ? '__Host-svara-session' : 'svara-session';
}

export function readSessionToken(header: string | undefined, name: string): string | undefined {
  const candidates = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (candidates.length !== 1) return undefined;
  const token = candidates[0]!.slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export class StaffBoundary {
  private activeCredentials = 0;
  constructor(private readonly options: IdentityHttpOptions | undefined) {}

  get settings(): IdentityHttpOptions {
    if (!this.options) throw new ServiceUnavailableException();
    return this.options;
  }

  token(request: Request): string {
    const token = this.optionalToken(request);
    if (!token) throw new IdentityError('UNAUTHENTICATED');
    return token;
  }

  optionalToken(request: Request): string | undefined {
    return readSessionToken(request.headers.cookie, sessionCookieName(this.settings.origin));
  }

  csrf(request: Request): string {
    return csrfToken(this.token(request), this.settings.pepper);
  }

  checkCsrf(request: Request): void {
    if (!verifyCsrf(this.token(request), request.get('x-csrf-token') ?? '', this.settings.pepper))
      throw new IdentityError('FORBIDDEN');
  }

  async limit(
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

  async authorize(request: Request, response: Response, anonymous = false): Promise<void> {
    const { origin, service } = this.settings;
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (
      request.headers.host !== new URL(origin).host ||
      (request.get('origin') !== undefined && request.get('origin') !== origin) ||
      (mutation && request.get('origin') !== origin)
    )
      throw new IdentityError('FORBIDDEN');
    if (mutation && !request.is('application/json')) throw new IdentityError('INVALID_INPUT');
    await this.limit(
      response,
      'staff-ip',
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      300,
      60000,
    );
    if (anonymous) return;
    const token = this.token(request);
    await this.limit(response, 'staff-session', token, 180, 60000);
    if (mutation) this.checkCsrf(request);
    response.locals.staffIdentity = await service.resolve(token, mutation);
  }

  identity(response: Response): SafeIdentity {
    return response.locals.staffIdentity as SafeIdentity;
  }

  async credentials<T>(request: Request, response: Response, run: () => Promise<T>): Promise<T> {
    await this.limit(
      response,
      'credential-ip',
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      30,
      600000,
    );
    const body: unknown = request.body;
    if (body && typeof body === 'object' && 'email' in body && typeof body.email === 'string')
      await this.limit(response, 'credential-account', body.email.trim().toLowerCase(), 10, 600000);
    if (this.activeCredentials >= 4) {
      response.setHeader('Retry-After', '2');
      throw new HttpException('BUSY', 429);
    }
    this.activeCredentials++;
    try {
      return await run();
    } finally {
      this.activeCredentials--;
    }
  }

  issue(response: Response, session: IssuedSession) {
    response.cookie(sessionCookieName(this.settings.origin), session.token, {
      httpOnly: true,
      secure: this.settings.origin.startsWith('https:'),
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, session.expiresAt.getTime() - Date.now()),
    });
    return { data: { identity: session.identity, csrfToken: session.csrfToken } };
  }

  clear(response: Response): void {
    response.clearCookie(sessionCookieName(this.settings.origin), {
      httpOnly: true,
      secure: this.settings.origin.startsWith('https:'),
      sameSite: 'lax',
      path: '/',
    });
  }

  link(kind: 'activate' | 'recover', grant: { token: string; expiresAt: Date }) {
    return {
      data: {
        url: `${this.settings.origin}/${kind}#token=${grant.token}`,
        expiresAt: grant.expiresAt.toISOString(),
      },
    };
  }
}
