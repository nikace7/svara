import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const connectionUrl = (protocols: string[]) =>
  z.url().refine((value) => protocols.includes(new URL(value).protocol));
const positiveInteger = (fallback: number, maximum: number) =>
  z.coerce.number().int().min(1).max(maximum).default(fallback);
const booleanSetting = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const serverSchema = z
  .object({
    APP_ENV: z.enum(['local', 'test', 'production']).default('local'),
    APP_ORIGIN: z.url().default('http://localhost:4320'),
    DATABASE_URL: connectionUrl(['postgres:', 'postgresql:']),
    TEST_DATABASE_URL: connectionUrl(['postgres:', 'postgresql:']),
    REDIS_URL: connectionUrl(['redis:', 'rediss:']),
    MEDIA_ROOT: z.string().min(1),
    MEDIA_INSPECTION_MODE: z.enum(['sandboxed', 'native']).default('sandboxed'),
    FFPROBE_PATH: z.string().trim().min(1).default('ffprobe'),
    MEDIA_SANDBOX_PATH: z.string().trim().min(1).default('/usr/local/bin/svara-media-sandbox'),
    AUTH_TOKEN_PEPPER: z.string().min(64),
    PROVIDER_MODE: z.enum(['fixture', 'live']).default('fixture'),
    AZURE_SPEECH_KEY: z.string().optional(),
    AZURE_SPEECH_REGION: z.string().optional(),
    GENERATION_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().min(1).default('gpt-5-mini'),
    VOICE_EN: z.literal('en-US-JennyNeural').default('en-US-JennyNeural'),
    VOICE_NE: z.enum(['ne-NP-HemkalaNeural', 'ne-NP-SagarNeural']).default('ne-NP-HemkalaNeural'),
    VOICE_SESSION_SECONDS: positiveInteger(300, 300),
    VOICE_IDLE_SECONDS: positiveInteger(60, 300),
    LIVE_DAILY_SESSIONS: positiveInteger(100, 10000),
    LIVE_DAILY_AUDIO_MINUTES: positiveInteger(60, 10000),
    TRANSCRIPT_RETENTION_DAYS: positiveInteger(30, 365),
    ALLOW_LIVE_EVAL: booleanSetting,
    BIND_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
    API_PORT: positiveInteger(4100, 65535),
    WORKER_PORT: positiveInteger(4101, 65535),
  })
  .superRefine((config, context) => {
    if (config.APP_ENV === 'production' && config.MEDIA_INSPECTION_MODE !== 'sandboxed') {
      context.addIssue({
        code: 'custom',
        path: ['MEDIA_INSPECTION_MODE'],
        message: 'Production media inspection requires the Linux sandbox.',
      });
    }
    const origin = new URL(config.APP_ORIGIN);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.origin !== config.APP_ORIGIN ||
      (origin.protocol === 'http:' && !loopback.has(origin.hostname)) ||
      (config.APP_ENV === 'production' && origin.protocol !== 'https:') ||
      (config.APP_ENV !== 'production' && !loopback.has(origin.hostname))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'Expected an exact secure origin or a local loopback origin.',
      });
    }
    if (config.PROVIDER_MODE === 'live') {
      const generationKey =
        config.GENERATION_PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
      for (const key of ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', generationKey] as const) {
        if (!config[key]?.trim())
          context.addIssue({ code: 'custom', path: [key], message: 'Required in live mode.' });
      }
    } else if (config.APP_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        path: ['PROVIDER_MODE'],
        message: 'Fixture mode is local/test only.',
      });
    }
  });

export type ServerConfig = z.infer<typeof serverSchema>;

export function parseServerConfig(environment: Record<string, string | undefined>): ServerConfig {
  const result = serverSchema.safeParse(environment);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid server configuration: ${fields.join(', ')}`);
  }
  return result.data;
}

export function loadWorkspaceEnvironment(): void {
  const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
  try {
    loadEnvFile(envPath);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}
