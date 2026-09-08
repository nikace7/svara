import { spawn } from 'node:child_process';
import { MEDIA_LIMITS } from '@svara/contracts';
import { InspectionError } from './policy.js';

type ProcessOptions = { timeoutMs: number; signal?: AbortSignal };
const outputLimit = 64 * 1024;

/** No shell, application secrets, unbounded logs, or surviving process groups. */
export function runMediaProcess(executable: string, args: string[], options: ProcessOptions) {
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > MEDIA_LIMITS.inspectionMs
  )
    throw new InspectionError('INSPECTION_TIMEOUT');
  return new Promise<{ stdout: string; exitCode: number | null }>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new InspectionError('INSPECTION_TIMEOUT'));
      return;
    }
    const environment: Record<string, string> = {
      LANG: 'C',
      LC_ALL: 'C',
      VIPS_CONCURRENCY: '1',
      UV_THREADPOOL_SIZE: '1',
    };
    for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
      if (process.env[key]) environment[key] = process.env[key];
    }
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let failure: InspectionError | undefined;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const chunks: Buffer[] = [];
    const stop = (error: InspectionError) => {
      failure ??= error;
      if (child.pid && process.platform !== 'win32') {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (cause) {
          if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH'))
            child.kill('SIGKILL');
        }
      } else child.kill('SIGKILL');
    };
    const cancel = () => stop(new InspectionError('INSPECTION_TIMEOUT'));
    const timer = setTimeout(cancel, options.timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > outputLimit) stop(new InspectionError('INVALID_MEDIA'));
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > outputLimit) stop(new InspectionError('INVALID_MEDIA'));
    });
    child.once('error', () => {
      failure ??= new InspectionError('INSPECTION_UNAVAILABLE');
    });
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      if (failure) reject(failure);
      else resolve({ stdout: Buffer.concat(chunks).toString('utf8'), exitCode });
    });
  });
}
