export function allowsLocalFeasibility(
  configuredOrigin: string | undefined,
  host: string | undefined,
  origin: string | undefined,
): boolean {
  if (!configuredOrigin || origin !== configuredOrigin || !host) return false;
  try {
    const parsed = new URL(`http://${host}`);
    return parsed.host === host && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}
