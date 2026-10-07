import { describe, expect, it } from 'vitest';

import { cmpSemanticVersion, getIsOutdated } from './versions';

describe('cmpSemanticVersion', () => {
  it('compares major, minor and patch numerically', () => {
    expect(cmpSemanticVersion('26.8.1', '26.8.1')).toBe(0);
    expect(cmpSemanticVersion('26.8.0', '26.8.1')).toBeLessThan(0);
    expect(cmpSemanticVersion('26.10.0', '26.9.9')).toBeGreaterThan(0);
    expect(cmpSemanticVersion('27.0.0', '26.12.5')).toBeGreaterThan(0);
  });

  it('ignores a leading "v"', () => {
    expect(cmpSemanticVersion('v26.8.1', '26.8.1')).toBe(0);
  });
});

describe('getIsOutdated', () => {
  it('does not treat a missing browser version as an application failure', () => {
    const actual = window.Actual;
    window.Actual = undefined as unknown as typeof window.Actual;

    try {
      expect(getIsOutdated('26.8.2')).toBe(false);
    } finally {
      window.Actual = actual;
    }
  });
});
