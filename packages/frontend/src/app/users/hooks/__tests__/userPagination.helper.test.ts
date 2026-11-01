import { describe, expect, it } from 'vitest';
import {
  hasUserClientFilters,
  resolveUserDisplayPagination,
} from '../userPagination.helper';

describe('userPagination helpers', () => {
  describe('hasUserClientFilters', () => {
    it('returns false when searchTerm and roleFilter are empty', () => {
      expect(hasUserClientFilters('', '')).toBe(false);
      expect(hasUserClientFilters('   ', '')).toBe(false);
    });

    it('returns true when searchTerm is provided', () => {
      expect(hasUserClientFilters('admin', '')).toBe(true);
      expect(hasUserClientFilters('John', '')).toBe(true);
    });

    it('returns true when roleFilter is provided', () => {
      expect(hasUserClientFilters('', 'SUPER_ADMIN')).toBe(true);
      expect(hasUserClientFilters('', 'rol-custom-1')).toBe(true);
    });

    it('returns true when both filters are provided', () => {
      expect(hasUserClientFilters('Kumar', 'OPERATOR')).toBe(true);
    });
  });

  describe('resolveUserDisplayPagination', () => {
    it('preserves server pagination when client filters are inactive', () => {
      const pagination = resolveUserDisplayPagination(false, 20, 100, 5, 20);
      expect(pagination.totalUsers).toBe(100);
      expect(pagination.totalPages).toBe(5);
    });

    it('preserves server pagination for empty database when client filters are inactive', () => {
      const pagination = resolveUserDisplayPagination(false, 0, 0, 0, 20);
      expect(pagination.totalUsers).toBe(0);
      expect(pagination.totalPages).toBe(0);
    });

    it('calculates display pagination from filtered users when client filters are active', () => {
      const pagination = resolveUserDisplayPagination(true, 3, 100, 5, 20);
      expect(pagination.totalUsers).toBe(3);
      expect(pagination.totalPages).toBe(1);
    });

    it('handles multiple pages of filtered results correctly', () => {
      const pagination = resolveUserDisplayPagination(true, 45, 100, 5, 20);
      expect(pagination.totalUsers).toBe(45);
      expect(pagination.totalPages).toBe(3);
    });

    it('guarantees at least 1 page for zero filtered matches when client filter is active', () => {
      const pagination = resolveUserDisplayPagination(true, 0, 100, 5, 20);
      expect(pagination.totalUsers).toBe(0);
      expect(pagination.totalPages).toBe(1);
    });
  });
});

