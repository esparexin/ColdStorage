import { describe, expect, it } from 'vitest';
import {
  formatPaymentStatus,
  formatRemainingDue,
  formatRentStructure,
  formatAgreedRates,
  getRentCollectionNotice,
} from '../rentDisplay.helper';

describe('rentDisplay.helper', () => {
  describe('formatAgreedRates', () => {
    it('returns formatted rates when small and big rates are provided', () => {
      expect(formatAgreedRates({ rentType: 'Seasonal', rentAmount: 0, smallBagPrice: 12, bigBagPrice: 18 })).toBe(
        'S: ₹12.00 | B: ₹18.00',
      );
    });

    it('returns formatted per bag price when single bagPrice provided', () => {
      expect(formatAgreedRates({ rentType: 'Seasonal', rentAmount: 0, bagPrice: 15 })).toBe('₹15.00/bag');
    });

    it('returns null when no bag rates are specified', () => {
      expect(formatAgreedRates({ rentType: 'Seasonal', rentAmount: 0 })).toBeNull();
    });
  });
  describe('formatRentStructure', () => {
    it('returns "Dynamic" for Monthly rent with zero rentAmount', () => {
      expect(formatRentStructure({ rentType: 'Monthly', rentAmount: 0 })).toBe('Dynamic');
    });

    it('returns "At Outward" for Seasonal rent with zero rentAmount', () => {
      expect(formatRentStructure({ rentType: 'Seasonal', rentAmount: 0 })).toBe('At Outward');
    });

    it('returns formatted INR currency string for positive rentAmount', () => {
      expect(formatRentStructure({ rentType: 'Seasonal', rentAmount: 4000 })).toBe('₹4,000');
    });

    it('prefers the pooled total due when finalized periods exist', () => {
      expect(formatRentStructure({ rentType: 'Seasonal', rentAmount: 1200, totalDue: 3600 })).toBe('₹3,600');
    });
  });

  describe('formatRemainingDue', () => {
    it('returns "Dynamic (Per Cycle)" for Monthly rent with zero dues', () => {
      expect(
        formatRemainingDue({ rentType: 'Monthly', rentAmount: 0, remainingBalance: 0 }),
      ).toBe('Dynamic (Per Cycle)');
    });

    it('returns "₹0 (No Dues)" for zero rent and zero balance', () => {
      expect(
        formatRemainingDue({ rentType: 'Seasonal', rentAmount: 0, remainingBalance: 0 }),
      ).toBe('₹0 (No Dues)');
    });

    it('returns formatted INR currency string for positive remaining balance', () => {
      expect(
        formatRemainingDue({ rentType: 'Seasonal', rentAmount: 4000, remainingBalance: 2500 }),
      ).toBe('₹2,500');
    });
  });

  describe('formatPaymentStatus', () => {
    it('returns "No Dues" with success variant when settled with 0 paid and 0 rent', () => {
      const res = formatPaymentStatus({ paymentStatus: 'Settled', totalPaid: 0, rentAmount: 0, rentType: 'Seasonal' });
      expect(res.label).toBe('No Dues');
      expect(res.variant).toBe('success');
    });

    it('returns "Settled" with success variant when settled after payment', () => {
      const res = formatPaymentStatus({ paymentStatus: 'Settled', totalPaid: 4000, rentAmount: 4000, rentType: 'Seasonal' });
      expect(res.label).toBe('Settled');
      expect(res.variant).toBe('success');
    });

    it('returns "Pending Dues" with warning variant when not settled', () => {
      const res = formatPaymentStatus({ paymentStatus: 'Not Settled', totalPaid: 0, rentAmount: 4000, rentType: 'Seasonal' });
      expect(res.label).toBe('Pending Dues');
      expect(res.variant).toBe('warning');
    });
  });

  describe('getRentCollectionNotice', () => {
    it('returns monthly cycle notice when Monthly and rentAmount is 0', () => {
      expect(
        getRentCollectionNotice({ rentType: 'Monthly', rentAmount: 0, remainingBalance: 0 }),
      ).toContain('Billing accrues dynamically per cycle');
    });

    it('returns outward dispatch notice when rentAmount and balance are 0', () => {
      expect(
        getRentCollectionNotice({ rentType: 'Seasonal', rentAmount: 0, remainingBalance: 0 }),
      ).toContain('Rent is assessed upon outward delivery dispatch');
    });

    it('returns bag count derivation notice when delivered bags exist with outstanding balance', () => {
      expect(
        getRentCollectionNotice({
          rentType: 'Seasonal',
          rentAmount: 4000,
          remainingBalance: 4000,
          deliveredBags: 40,
        }),
      ).toBe('Rent obligation is derived from 40 outward delivered bags.');
    });

    it('returns null when no special condition matches', () => {
      expect(
        getRentCollectionNotice({
          rentType: 'Seasonal',
          rentAmount: 4000,
          remainingBalance: 0,
          deliveredBags: 0,
        }),
      ).toBeNull();
    });
  });
});
