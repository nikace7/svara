export type DependencyProbe = () => Promise<void>;
export type Readiness = {
  status: 'ready' | 'unavailable';
  dependencies: Record<string, 'ready' | 'unavailable'>;
};

export async function checkReadiness(
  probes: Record<string, DependencyProbe>,
  timeoutMs = 2000,
): Promise<Readiness> {
  const entries = await Promise.all(
    Object.entries(probes).map(async ([name, probe]) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.resolve().then(probe),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Dependency timeout')), timeoutMs);
          }),
        ]);
        return [name, 'ready'] as const;
      } catch {
        return [name, 'unavailable'] as const;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return {
    status: entries.every(([, status]) => status === 'ready') ? 'ready' : 'unavailable',
    dependencies: Object.fromEntries(entries),
  };
}
