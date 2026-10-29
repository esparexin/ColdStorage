import { describe, expect, it } from 'vitest';
import {
  hasDeliveryClientFilters,
  resolveDisplayPagination,
} from '../deliveryFilter.helper';

describe('deliveryPagination helpers', () => {
  describe('hasDeliveryClientFilters', () => {
    it('returns false when searchTerm and rentStatusFilter are empty', () => {
      expect(hasDeliveryClientFilters('', '')).toBe(false);
      expect(hasDeliveryClientFilters('   ', '')).toBe(false);
    });

    it('returns true when searchTerm is provided', () => {
      expect(hasDeliveryClientFilters('CHL-001', '')).toBe(true);
      expect(hasDeliveryClientFilters('Kalyan', '')).toBe(true);
    });

    it('returns true when rentStatusFilter is provided', () => {
      expect(hasDeliveryClientFilters('', 'DUE')).toBe(true);
      expect(hasDeliveryClientFilters('', 'SETTLED')).toBe(true);
      expect(hasDeliveryClientFilters('', 'PARTIAL')).toBe(true);
    });

    it('returns true when both filters are provided', () => {
      expect(hasDeliveryClientFilters('Wheat', 'DUE')).toBe(true);
    });
  });

  describe('resolveDisplayPagination', () => {
    it('preserves server pagination when client filters are inactive', () => {
      const pagination = resolveDisplayPagination(false, 20, 145, 8, 20);
      expect(pagination.totalDeliveries).toBe(145);
      expect(pagination.totalPages).toBe(8);
    });

    it('preserves server pagination for empty facility when client filters are inactive', () => {
      const pagination = resolveDisplayPagination(false, 0, 0, 0, 20);
      expect(pagination.totalDeliveries).toBe(0);
      expect(pagination.totalPages).toBe(0);
    });

    it('calculates display pagination from filtered deliveries when client filters are active', () => {
      const pagination = resolveDisplayPagination(true, 5, 145, 8, 20);
      expect(pagination.totalDeliveries).toBe(5);
      expect(pagination.totalPages).toBe(1);
    });

    it('handles multiple pages of filtered results correctly', () => {
      const pagination = resolveDisplayPagination(true, 45, 145, 8, 20);
      expect(pagination.totalDeliveries).toBe(45);
      expect(pagination.totalPages).toBe(3);
    });

    it('guarantees at least 1 page for zero filtered matches when client filter is active', () => {
      const pagination = resolveDisplayPagination(true, 0, 145, 8, 20);
      expect(pagination.totalDeliveries).toBe(0);
      expect(pagination.totalPages).toBe(1);
    });
  });
});

