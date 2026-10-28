import { describe, expect, it } from 'vitest';
import type { RentSummaryDto } from '@cold-storage/contracts';
import {
  autoAllocatePayment,
  getCustomersWithRentDues,
  getGrnsForCustomer,
  validateBatchCollectPayment,
} from '../batchCollectPayment.helper';

function createSampleAccount(overrides: Partial<RentSummaryDto>): RentSummaryDto {
  return {
    grnId: 'grn-sample-1',
    grnNumber: 'GRN-01',
    facilityId: 'fac-1',
    customerId: 'cust-1',
    customerName: 'Customer One',
    commodityName: 'Potato',
    chamber: 'CH-01',
    inwardDate: new Date('2026-03-01'),
    totalBags: 100,
    rentType: 'Seasonal',
    rentAmount: 1000,
    totalPaid: 0,
    remainingBalance: 1000,
    paymentStatus: 'Not Settled',
    rentState: 'UNBILLED',
    payments: [],
    extensions: [],
    totalDue: 1000,
    ...overrides,
  };
}

describe('batchCollectPayment.helper', () => {
  describe('getCustomersWithRentDues', () => {
    it('aggregates outstanding balances across multiple GRNs for each customer', () => {
      const accounts: RentSummaryDto[] = [
        createSampleAccount({
          grnId: 'g1',
          customerId: 'c1',
          customerName: 'Customer B',
          remainingBalance: 500,
        }),
        createSampleAccount({
          grnId: 'g2',
          customerId: 'c1',
          customerName: 'Customer B',
          remainingBalance: 300,
        }),
        createSampleAccount({
          grnId: 'g3',
          customerId: 'c2',
          customerName: 'Customer A',
          remainingBalance: 1200,
        }),
        createSampleAccount({
          grnId: 'g4',
          customerId: 'c3',
          customerName: 'Customer Zero',
          remainingBalance: 0,
        }),
      ];

      const customers = getCustomersWithRentDues(accounts);
      expect(customers).toHaveLength(2);
      expect(customers[0].customerName).toBe('Customer A');
      expect(customers[0].totalOutstandingBalance).toBe(1200);
      expect(customers[1].customerName).toBe('Customer B');
      expect(customers[1].totalOutstandingBalance).toBe(800);
      expect(customers[1].openGrnCount).toBe(2);
    });
  });

  describe('getGrnsForCustomer', () => {
    it('filters for specified customer and sorts by inwardDate ascending', () => {
      const accounts: RentSummaryDto[] = [
        createSampleAccount({
          grnId: 'g1',
          customerId: 'c1',
          inwardDate: new Date('2026-03-15'),
          remainingBalance: 200,
        }),
        createSampleAccount({
          grnId: 'g2',
          customerId: 'c1',
          inwardDate: new Date('2026-03-01'),
          remainingBalance: 400,
        }),
        createSampleAccount({
          grnId: 'g3',
          customerId: 'c2',
          inwardDate: new Date('2026-02-01'),
          remainingBalance: 500,
        }),
      ];

      const grns = getGrnsForCustomer(accounts, 'c1');
      expect(grns).toHaveLength(2);
      expect(grns[0].grnId).toBe('g2'); // March 1st (older)
      expect(grns[1].grnId).toBe('g1'); // March 15th
    });
  });

  describe('autoAllocatePayment', () => {
    it('distributes total payment greedily to oldest GRNs first', () => {
      const grns: RentSummaryDto[] = [
        createSampleAccount({ grnId: 'g1', remainingBalance: 1000 }),
        createSampleAccount({ grnId: 'g2', remainingBalance: 1500 }),
        createSampleAccount({ grnId: 'g3', remainingBalance: 2000 }),
      ];

      const alloc = autoAllocatePayment(grns, 2000);
      expect(alloc['g1']).toBe(1000); // Fully satisfied
      expect(alloc['g2']).toBe(1000); // Partially satisfied
      expect(alloc['g3']).toBe(0); // Exhausted
    });

    it('caps allocation at remainingBalance if payment exceeds total dues', () => {
      const grns: RentSummaryDto[] = [
        createSampleAccount({ grnId: 'g1', remainingBalance: 500 }),
        createSampleAccount({ grnId: 'g2', remainingBalance: 300 }),
      ];

      const alloc = autoAllocatePayment(grns, 2000);
      expect(alloc['g1']).toBe(500);
      expect(alloc['g2']).toBe(300);
    });
  });

  describe('validateBatchCollectPayment', () => {
    const grns: RentSummaryDto[] = [
      createSampleAccount({ grnId: 'g1', grnNumber: 'GRN-01', remainingBalance: 1000 }),
      createSampleAccount({ grnId: 'g2', grnNumber: 'GRN-02', remainingBalance: 500 }),
    ];

    it('returns error if total allocation is zero', () => {
      const err = validateBatchCollectPayment({ g1: 0, g2: 0 }, grns, 'Cash');
      expect(err).toBe('Total allocated payment must be greater than ₹0');
    });

    it('returns error if allocation exceeds GRN balance', () => {
      const err = validateBatchCollectPayment({ g1: 1500, g2: 200 }, grns, 'Cash');
      expect(err).toContain('exceeds remaining balance');
    });

    it('validates UPI reference requirements', () => {
      expect(validateBatchCollectPayment({ g1: 500 }, grns, 'UPI', '')).toBe(
        'UPI reference is required when payment mode is UPI',
      );
      expect(validateBatchCollectPayment({ g1: 500 }, grns, 'UPI', '123')).toBe(
        'UPI reference must be at least 6 characters',
      );
      expect(validateBatchCollectPayment({ g1: 500 }, grns, 'UPI', 'UPI-123456')).toBeNull();
    });

    it('returns null for valid Cash payment', () => {
      const err = validateBatchCollectPayment({ g1: 500, g2: 200 }, grns, 'Cash');
      expect(err).toBeNull();
    });
  });
});
