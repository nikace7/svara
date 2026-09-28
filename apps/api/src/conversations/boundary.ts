import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConversationError, IdentityError, verifyCsrf } from '@svara/domain';
import type {
  AssistantLinkService,
  ConversationService,
  ConversationSessions,
  PublicAssistants,
} from '@svara/domain';
import type { Request, Response } from 'express';
import { readSessionToken } from '../auth/boundary.js';
import type { IdentityHttpOptions } from '../auth/boundary.js';
import type { TurnStreaming } from './stream.js';

export const CONVERSATION_BOUNDARY = Symbol('conversation-boundary');
export interface ConversationHttpOptions {
  service: Pick<ConversationService, 'admit' | 'interrupt' | 'end'>;
  sessions: Pick<ConversationSessions, 'list' | 'get' | 'deleteTranscript'>;
  links: Pick<AssistantLinkService, 'list' | 'create' | 'save'>;
  publics: Pick<PublicAssistants, 'config' | 'grant' | 'media'>;
  streaming: TurnStreaming;
  origin: string;
  pepper: string;
  consumeLimit: IdentityHttpOptions['consumeLimit'];
}
export function visitorCookieName(origin: string): string {
  return new URL(origin).protocol === 'https:' ? '__Host-svara-visitor' : 'svara-visitor';
}

/** Anonymous visitors: same-origin requests, per-IP limits and a link-bound HttpOnly grant. */
export class ConversationBoundary {
  constructor(private readonly options: ConversationHttpOptions | undefined) {}
  get settings(): ConversationHttpOptions {
    if (!this.options) throw new ServiceUnavailableException();
    return this.options;
  }
  visitorToken(request: Request): string {
    const token = readSessionToken(request.headers.cookie, visitorCookieName(this.settings.origin));
    if (!token) throw new ConversationError('VISITOR_UNAUTHENTICATED');
    return token;
  }
  /** Every public route: exact host and origin, JSON mutations and an IP budget. Mutations
   * other than opening a grant also need the grant's CSRF token. */
  async authorizeVisitor(request: Request, response: Response, grant = false): Promise<void> {
    const { origin } = this.settings;
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (
      request.headers.host !== new URL(origin).host ||
      (request.get('origin') !== undefined && request.get('origin') !== origin) ||
      (mutation && request.get('origin') !== origin)
    )
      throw new IdentityError('FORBIDDEN');
    if (mutation && !request.is('application/json')) throw new ConversationError('INVALID_INPUT');
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    await this.limit(response, 'visitor-ip', ip, 120, 60000);
    if (grant) {
      await this.limit(response, 'visitor-grant-ip', ip, 10, 60000);
      return;
    }
    if (!mutation) return;
    const token = this.visitorToken(request);
    if (!verifyCsrf(token, request.get('x-csrf-token') ?? '', this.settings.pepper))
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
  issueVisitor(response: Response, token: string, expiresAt: Date): void {
    response.cookie(visitorCookieName(this.settings.origin), token, {
      httpOnly: true,
      secure: new URL(this.settings.origin).protocol === 'https:',
      sameSite: 'strict',
      path: '/',
      expires: expiresAt,
    });
  }
}
