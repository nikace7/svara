import { describe, expect, it } from 'vitest';
import { FeasibilityRequestSchema, FeasibilityEventSchema } from './feasibility.js';

describe('local feasibility contracts', () => {
  it('accepts exactly one bounded input and a supported explicit locale', () => {
    expect(
      FeasibilityRequestSchema.parse({ locale: 'ne-NP', generation: 1, text: ' नमस्ते ' }).text,
    ).toBe('नमस्ते');
    for (const invalid of [
      { locale: 'auto', generation: 1, text: 'test' },
      { locale: 'en-US', generation: 0, text: 'test' },
      { locale: 'en-US', generation: 1 },
      { locale: 'en-US', generation: 1, text: 'test', scenario: 'supported_faq' },
      { locale: 'en-US', generation: 1, text: 'x'.repeat(1001) },
      { locale: 'en-US', generation: 1, scenario: 'untrusted_action' },
      { locale: 'en-US', generation: 1, text: 'test', organisationId: 'other' },
    ])
      expect(FeasibilityRequestSchema.safeParse(invalid).success).toBe(false);
  });
  it('rejects unversioned/unbounded events', () => {
    expect(FeasibilityEventSchema.safeParse({ type: 'complete' }).success).toBe(false);
  });
});
