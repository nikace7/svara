import { describe, expect, it } from 'vitest';
import { allowsLocalFeasibility } from './local-access.js';

describe('temporary local feasibility access', () => {
  it('requires enabled local mode, loopback Host and exact Origin', () => {
    expect(
      allowsLocalFeasibility('http://localhost:4320', 'localhost:4320', 'http://localhost:4320'),
    ).toBe(true);
    for (const [configured, host, origin] of [
      [undefined, 'localhost:4320', 'http://localhost:4320'],
      ['http://localhost:4320', 'evil.example', 'http://localhost:4320'],
      ['http://localhost:4320', 'localhost:4320', undefined],
      ['http://localhost:4320', 'localhost:4320', 'http://evil.example'],
      ['http://localhost:4320', 'bad host', 'http://localhost:4320'],
    ])
      expect(allowsLocalFeasibility(configured, host, origin)).toBe(false);
  });
});
