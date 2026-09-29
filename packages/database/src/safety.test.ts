import { describe, expect, it } from 'vitest';
import {
  assertDemoDatabase,
  assertResetTarget,
  assertRestoreTarget,
  assertTestDatabase,
} from './safety.js';

describe('database target protection', () => {
  it('accepts only explicitly local, isolated test targets', () => {
    expect(() =>
      assertTestDatabase('postgresql://svara:test@127.0.0.1:5434/svara_test', 'test'),
    ).not.toThrow();
    expect(() =>
      assertTestDatabase('postgresql://svara:test@postgres:5432/svara_test', 'test'),
    ).not.toThrow();
  });

  it.each([
    ['postgresql://svara:secret@127.0.0.1/svara_dev', 'test'],
    ['postgresql://svara:secret@db.example.com/svara_test', 'test'],
    ['postgresql://svara:secret@127.0.0.1/svara_test', 'local'],
    ['postgresql://svara:secret@127.0.0.1/customer_test', 'test'],
    ['postgresql://svara:secret@127.0.0.1/svara_test?host=example.com', 'test'],
    ['not-a-url', 'test'],
    ['https://127.0.0.1/svara_test', 'test'],
  ])('refuses unsafe target %s', (url, env) => {
    expect(() => assertTestDatabase(url, env)).toThrow('Refusing');
    expect(() => assertTestDatabase(url, env)).not.toThrow(/secret/);
  });

  it('keeps demo migrations and seeds away from tests and production', () => {
    expect(() =>
      assertDemoDatabase('postgresql://svara:password@localhost/svara_dev', 'local'),
    ).not.toThrow();
    expect(() =>
      assertDemoDatabase('postgresql://svara:password@localhost/svara_test', 'local'),
    ).toThrow();
    expect(() =>
      assertDemoDatabase('postgresql://svara:password@localhost/svara_dev', 'production'),
    ).toThrow();
  });

  it('restores only into a separately named database', () => {
    expect(() => assertRestoreTarget('svara_restore')).not.toThrow();
    expect(() => assertRestoreTarget('svara_restore_0929')).not.toThrow();
    for (const name of [
      'svara_dev',
      'svara_test',
      'postgres',
      'svara_restore;drop',
      'Svara_restore',
    ])
      expect(() => assertRestoreTarget(name)).toThrow('Refusing restore');
  });

  it('resets only the confirmed demo database and the workspace media directory', () => {
    const dev = 'postgresql://svara:secret@127.0.0.1:5434/svara_dev';
    const media = 'C:/work/svara/.local/media';
    expect(() => assertResetTarget(dev, 'local', media, 'svara_dev')).not.toThrow();
    expect(() =>
      assertResetTarget(dev, 'local', '/srv/app/.local/media/', 'svara_dev'),
    ).not.toThrow();
    for (const [url, env, root, confirm] of [
      [dev, 'local', media, undefined],
      [dev, 'local', media, 'yes'],
      [dev, 'local', 'C:/Users/me/Pictures', 'svara_dev'],
      [dev, 'local', '/', 'svara_dev'],
      [dev, 'local', '/srv/.local/media/../../etc', 'svara_dev'],
      [dev, 'production', media, 'svara_dev'],
      ['postgresql://svara:secret@127.0.0.1:5434/svara_test', 'local', media, 'svara_dev'],
      ['postgresql://svara:secret@db.example.com/svara_dev', 'local', media, 'svara_dev'],
    ] as const)
      expect(() => assertResetTarget(url, env, root, confirm)).toThrow('Refusing');
  });
});
