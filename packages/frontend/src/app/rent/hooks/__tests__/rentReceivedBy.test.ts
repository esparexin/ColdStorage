import { describe, expect, it } from 'vitest';
import { formatReceivedBy } from '../rentDisplay.helper';

describe('formatReceivedBy', () => {
  it('returns Admin when value is null or empty', () => {
    expect(formatReceivedBy(null)).toBe('Admin');
    expect(formatReceivedBy(undefined)).toBe('Admin');
    expect(formatReceivedBy('')).toBe('Admin');
  });

  it('returns Admin when value is a raw DB UUID', () => {
    expect(formatReceivedBy('usr-a0db2252-85e0-4ec9-8446-4db6d0c5b0ab')).toBe('Admin');
  });

  it('preserves human readable staff/operator names', () => {
    expect(formatReceivedBy('Ramesh')).toBe('Ramesh');
    expect(formatReceivedBy('Admin User')).toBe('Admin User');
  });
});
