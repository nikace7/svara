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
    expect(config.SPEECH_PROVIDER).toBe('gemini');
    expect(config.GENERATION_PROVIDER).toBe('gemini');
    expect(config.GEMINI_MODEL).toBe('gemini-3.8-flash');
    expect(config.GEMINI_TTS_MODEL).toBe('gemini-3.8-flash-tts');
    expect(config.GEMINI_STT_MODEL).toBe('gemini-3.5-transcribe');
    expect(config.GEMINI_VOICE).toBe('Kore');
    expect(config.TRUST_PROXY_HOPS).toBe(0);
    expect(config.APP_ORIGIN).toBe('http://localhost:4320');
    expect(config.MEDIA_INSPECTION_MODE).toBe('sandboxed');
    expect(config.FFPROBE_PATH).toBe('ffprobe');
    expect(config).toMatchObject({ WORKER_NAMESPACE: 'svara' });
  });

  it('bounds and validates the shared queue and heartbeat namespace', () => {
    expect(parseServerConfig({ ...valid, WORKER_NAMESPACE: 'svara-test-42' })).toMatchObject({
      WORKER_NAMESPACE: 'svara-test-42',
    });
    for (const WORKER_NAMESPACE of ['', 'namespace with spaces', '*', 'a'.repeat(81)]) {
      expect(() => parseServerConfig({ ...valid, WORKER_NAMESPACE })).toThrow('WORKER_NAMESPACE');
    }
  });

  it('names all missing live settings without exposing any supplied secret', () => {
    expect(() => parseServerConfig({ ...valid, PROVIDER_MODE: 'live' })).toThrow(
      /Invalid server configuration: GEMINI_API_KEY$/,
    );
    expect(() =>
      parseServerConfig({ ...valid, PROVIDER_MODE: 'live', SPEECH_PROVIDER: 'azure' }),
    ).toThrow(/AZURE_SPEECH_KEY.*AZURE_SPEECH_REGION.*GEMINI_API_KEY/);
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
      SPEECH_PROVIDER: 'azure',
      GENERATION_PROVIDER: 'openai',
      AZURE_SPEECH_KEY: 'test-key',
      AZURE_SPEECH_REGION: 'test-region',
      OPENAI_API_KEY: 'test-key',
      ALLOW_LIVE_EVAL: 'true',
    });
    expect(config.PROVIDER_MODE).toBe('live');
    expect(config.ALLOW_LIVE_EVAL).toBe(true);
  });

  it('accepts a Gemini-only live demo with a single key', () => {
    const config = parseServerConfig({
      ...valid,
      PROVIDER_MODE: 'live',
      GEMINI_API_KEY: 'synthetic',
    });
    expect(config.SPEECH_PROVIDER).toBe('gemini');
    expect(config.GENERATION_PROVIDER).toBe('gemini');
    expect(config.AZURE_SPEECH_KEY).toBeUndefined();
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(() =>
      parseServerConfig({ ...valid, PROVIDER_MODE: 'live', OPENAI_API_KEY: 'synthetic' }),
    ).toThrow('GEMINI_API_KEY');
  });

  it('requires Azure credentials only when Azure speech is selected', () => {
    expect(() =>
      parseServerConfig({
        ...valid,
        PROVIDER_MODE: 'live',
        SPEECH_PROVIDER: 'azure',
        GEMINI_API_KEY: 'synthetic',
      }),
    ).toThrow(/Invalid server configuration: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION$/);
    expect(() => parseServerConfig({ ...valid, SPEECH_PROVIDER: 'whisper' })).toThrow(
      'SPEECH_PROVIDER',
    );
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

  it('allows explicit native inspection for development but requires the sandbox in production', () => {
    expect(
      parseServerConfig({ ...valid, MEDIA_INSPECTION_MODE: 'native' }).MEDIA_INSPECTION_MODE,
    ).toBe('native');
    expect(() =>
      parseServerConfig({
        ...valid,
        APP_ENV: 'production',
        APP_ORIGIN: 'https://studio.example.test',
        PROVIDER_MODE: 'live',
        AZURE_SPEECH_KEY: 'synthetic',
        AZURE_SPEECH_REGION: 'eastus',
        GEMINI_API_KEY: 'synthetic',
        MEDIA_INSPECTION_MODE: 'native',
      }),
    ).toThrow('MEDIA_INSPECTION_MODE');
    expect(() => parseServerConfig({ ...valid, FFPROBE_PATH: '' })).toThrow('FFPROBE_PATH');
  });

  it.each([
    { DATABASE_URL: 'https://example.com/db' },
    { REDIS_URL: 'https://example.com' },
    { ALLOW_LIVE_EVAL: 'yes' },
    { MEDIA_ROOT: '' },
    { APP_ENV: 'staging' },
    { TRUST_PROXY_HOPS: '2' },
    { GEMINI_VOICE: 'Kore; drop table' },
  ])('rejects invalid settings', (override) => {
    expect(() => parseServerConfig({ ...valid, ...override })).toThrow(
      'Invalid server configuration',
    );
  });
});
