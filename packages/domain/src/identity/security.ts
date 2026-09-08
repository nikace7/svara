import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { IdentityError } from './errors.js';

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const passwordPrefix = 'scrypt$32768$8$3';
const idleMilliseconds = 30 * 60 * 1000;
export const sessionMilliseconds = 8 * 60 * 60 * 1000;

export function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 128) throw new IdentityError('INVALID_INPUT');
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // OWASP's N=2^15, r=8, p=3 profile keeps each derivation bounded to ~32 MiB.
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${passwordPrefix}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const match = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(hash);
  if (!match || password.length > 128) return false;
  const key = await derive(password, Buffer.from(match[1]!, 'hex'));
  return timingSafeEqual(key, Buffer.from(match[2]!, 'hex'));
}

export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

function digest(token: string, pepper: string, purpose: string): string {
  if (!tokenPattern.test(token) || pepper.length < 64) throw new IdentityError('UNAUTHENTICATED');
  return createHmac('sha256', pepper).update(`${purpose}\0${token}`).digest('base64url');
}

export function hashToken(token: string, pepper: string): string {
  return digest(token, pepper, 'credential');
}

export function csrfToken(token: string, pepper: string): string {
  return digest(token, pepper, 'csrf');
}

export function verifyCsrf(token: string, supplied: string, pepper: string): boolean {
  return (
    tokenPattern.test(supplied) &&
    timingSafeEqual(Buffer.from(csrfToken(token, pepper)), Buffer.from(supplied))
  );
}

export function sessionIsCurrent(
  session: { createdAt: Date; lastSeenAt: Date; expiresAt: Date; revokedAt: Date | null },
  now: Date,
): boolean {
  const time = now.getTime();
  return (
    session.revokedAt === null &&
    time >= session.createdAt.getTime() &&
    time >= session.lastSeenAt.getTime() &&
    time < session.expiresAt.getTime() &&
    time - session.createdAt.getTime() < sessionMilliseconds &&
    time - session.lastSeenAt.getTime() < idleMilliseconds
  );
}
