import { createHmac } from 'node:crypto';
import type { Redis } from 'ioredis';

const consume = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
if count > tonumber(ARGV[1]) then return math.max(1, math.ceil(redis.call('PTTL', KEYS[1]) / 1000)) end
return 0
`;

/** Atomic shared windows; keys contain a purpose-bound digest, never email/IP/session values. */
export function createStaffLimiter(redis: Redis, pepper: string) {
  return async (
    bucket: string,
    subject: string,
    limit: number,
    windowMs: number,
  ): Promise<number> => {
    const digest = createHmac('sha256', pepper).update(`rate\0${bucket}\0${subject}`).digest('hex');
    const value = await redis.eval(consume, 1, `svara:rate:${bucket}:${digest}`, limit, windowMs);
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
      throw new Error('Rate limit unavailable.');
    return value;
  };
}
