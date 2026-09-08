import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

try {
  loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@svara/ui', '@svara/contracts', '@svara/audio'],
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
