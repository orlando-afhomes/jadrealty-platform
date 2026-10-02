import { describe, expect, it } from 'vitest';

import { formatPoints } from './points.js';

describe('formatPoints', () => {
  it('formats whole points without decimals or currency', () => {
    expect(formatPoints('5000.00')).toBe('5,000 Points');
    expect(formatPoints('1000.00')).toBe('1,000 Points');
    expect(formatPoints('500.00')).toBe('500 Points');
  });

  it('uses the singular for exactly one point', () => {
    expect(formatPoints('1.00')).toBe('1 Point');
  });

  it('keeps genuine fractions', () => {
    expect(formatPoints('150.50')).toBe('150.5 Points');
    expect(formatPoints('150.55')).toBe('150.55 Points');
    expect(formatPoints('350.00')).toBe('350 Points');
  });

  it('throws on malformed input instead of guessing', () => {
    expect(() => formatPoints('5,000')).toThrow();
    expect(() => formatPoints('abc')).toThrow();
  });
});
