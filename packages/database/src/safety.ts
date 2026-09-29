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

/** A restore only ever creates a new, clearly named database beside the working ones; it can
 * never be aimed at svara_dev, svara_test or anything else. */
export function assertRestoreTarget(database: string): void {
  if (!/^svara_restore(_[a-z0-9]{1,32})?$/.test(database))
    throw new Error(
      'Refusing restore: the target must be a new database named svara_restore or svara_restore_<suffix>.',
    );
}

/** A demo reset deletes everything, so it needs the local demo database, the workspace's own
 * `.local/media` directory and the database name typed as confirmation. */
export function assertResetTarget(
  connection: string,
  environment: string,
  mediaRoot: string,
  confirmation: string | undefined,
): void {
  assertDemoDatabase(connection, environment);
  if (!/(^|[/\\])\.local[/\\]media[/\\]?$/.test(mediaRoot))
    throw new Error('Refusing reset: MEDIA_ROOT must be the workspace .local/media directory.');
  if (confirmation !== 'svara_dev')
    throw new Error('Refusing reset: confirm by passing the database name, svara_dev.');
}
