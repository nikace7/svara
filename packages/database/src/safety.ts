const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', 'postgres']);

function assertTarget(
  connection: string,
  environment: string,
  expectedEnvironment: string,
  database: string,
): void {
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new Error('Refusing database operation: invalid local target.');
  }
  if (
    environment !== expectedEnvironment ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !localHosts.has(url.hostname) ||
    url.pathname !== `/${database}` ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `Refusing database operation: requires ${expectedEnvironment} environment and local ${database} database without URL options.`,
    );
  }
}

export function assertTestDatabase(connection: string, environment: string): void {
  assertTarget(connection, environment, 'test', 'svara_test');
}

export function assertDemoDatabase(connection: string, environment: string): void {
  assertTarget(connection, environment, 'local', 'svara_dev');
}
