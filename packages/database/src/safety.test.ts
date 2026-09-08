import { describe, expect, it } from 'vitest';
import { assertDemoDatabase, assertTestDatabase } from './safety.js';

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
});
