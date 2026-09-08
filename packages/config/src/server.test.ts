import { describe, expect, it } from 'vitest';
import { parseServerConfig } from './server.js';

const valid = {
  DATABASE_URL: 'postgresql://svara:test@127.0.0.1:5434/svara_dev',
  TEST_DATABASE_URL: 'postgresql://svara:test@127.0.0.1:5434/svara_test',
  REDIS_URL: 'redis://127.0.0.1:6381',
  MEDIA_ROOT: '/tmp/svara-media',
  AUTH_TOKEN_PEPPER: 'a'.repeat(64),
};

describe('server configuration', () => {
  it('defaults to fixture mode without requesting credentials', () => {
    const config = parseServerConfig(valid);
    expect(config.PROVIDER_MODE).toBe('fixture');
    expect(config.ALLOW_LIVE_EVAL).toBe(false);
    expect(config.APP_ORIGIN).toBe('http://localhost:4320');
  });

  it('names all missing live settings without exposing any supplied secret', () => {
    expect(() => parseServerConfig({ ...valid, PROVIDER_MODE: 'live' })).toThrow(
      /AZURE_SPEECH_KEY.*AZURE_SPEECH_REGION.*OPENAI_API_KEY/,
    );
    expect(() => parseServerConfig({ ...valid, AUTH_TOKEN_PEPPER: 'private-value' })).toThrow(
      'AUTH_TOKEN_PEPPER',
    );
    expect(() => parseServerConfig({ ...valid, AUTH_TOKEN_PEPPER: 'private-value' })).not.toThrow(
      /private-value/,
    );
  });

  it('accepts explicit live configuration and boolean opt-in', () => {
    const config = parseServerConfig({
      ...valid,
      PROVIDER_MODE: 'live',
      AZURE_SPEECH_KEY: 'test-key',
      AZURE_SPEECH_REGION: 'test-region',
      OPENAI_API_KEY: 'test-key',
      ALLOW_LIVE_EVAL: 'true',
    });
    expect(config.PROVIDER_MODE).toBe('live');
    expect(config.ALLOW_LIVE_EVAL).toBe(true);
  });

  it.each([
    'https://example.com/path',
    'http://example.com',
    'https://u:p@example.com',
    'https://example.com?q=1',
  ])('rejects unsafe origin %s', (APP_ORIGIN) => {
    expect(() => parseServerConfig({ ...valid, APP_ORIGIN })).toThrow('APP_ORIGIN');
  });

  it.each(['0', '-1', 'NaN', '1.5', '301'])(
    'rejects invalid session duration %s',
    (VOICE_SESSION_SECONDS) => {
      expect(() => parseServerConfig({ ...valid, VOICE_SESSION_SECONDS })).toThrow(
        'VOICE_SESSION_SECONDS',
      );
    },
  );

  it('requires secure production origin and prevents public fixture configuration', () => {
    expect(() => parseServerConfig({ ...valid, APP_ENV: 'production' })).toThrow();
    expect(() =>
      parseServerConfig({ ...valid, APP_ENV: 'local', APP_ORIGIN: 'https://example.com' }),
    ).toThrow('APP_ORIGIN');
  });

  it.each([
    { DATABASE_URL: 'https://example.com/db' },
    { REDIS_URL: 'https://example.com' },
    { ALLOW_LIVE_EVAL: 'yes' },
    { MEDIA_ROOT: '' },
    { APP_ENV: 'staging' },
  ])('rejects invalid settings', (override) => {
    expect(() => parseServerConfig({ ...valid, ...override })).toThrow(
      'Invalid server configuration',
    );
  });
});
