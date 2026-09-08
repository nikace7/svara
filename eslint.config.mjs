import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/generated/**',
      '**/*.generated.ts',
      'coverage/**',
      'artifacts/**',
      'test-results/**',
      'playwright-report/**',
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  ...nextVitals.map((config) => ({
    ...config,
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
  })),
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/{ui,audio,contracts}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@svara/database',
                '@svara/database/*',
                '@svara/domain',
                '@svara/domain/*',
                '@svara/providers',
                '@svara/providers/*',
                '@svara/config/server',
                '**/database/src/**',
                '**/domain/src/**',
                '**/providers/src/**',
              ],
              message: 'Server-only packages cannot enter browser bundles.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@svara/web', '@svara/api', '@svara/worker', '**/apps/**'],
              message: 'Packages must not import application entrypoints.',
            },
          ],
        },
      ],
    },
  },
);
