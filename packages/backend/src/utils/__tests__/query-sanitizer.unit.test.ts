import { describe, expect, it } from 'vitest';
import { sanitizeId, toEqId } from '../query-sanitizer.js';

describe('query-sanitizer', () => {
  describe('sanitizeId', () => {
    it('returns trimmed string for valid string input', () => {
      expect(sanitizeId('  grn-12345  ')).toBe('grn-12345');
    });

    it('returns empty string for non-string types', () => {
      expect(sanitizeId(null)).toBe('');
      expect(sanitizeId(undefined)).toBe('');
      expect(sanitizeId(12345)).toBe('');
      expect(sanitizeId(true)).toBe('');
    });

    it('neutralizes NoSQL operator injection payload objects', () => {
      expect(sanitizeId({ $ne: null })).toBe('');
      expect(sanitizeId({ $gt: '' })).toBe('');
      expect(sanitizeId(['grn-1', 'grn-2'])).toBe('');
    });
  });

  describe('toEqId', () => {
    it('wraps valid id in $eq literal object', () => {
      expect(toEqId('grn-999')).toEqual({ $eq: 'grn-999' });
    });

    it('wraps malicious object injection into empty literal equality', () => {
      expect(toEqId({ $ne: null })).toEqual({ $eq: '' });
      expect(toEqId({ $where: 'sleep(1000)' })).toEqual({ $eq: '' });
    });
  });
});
