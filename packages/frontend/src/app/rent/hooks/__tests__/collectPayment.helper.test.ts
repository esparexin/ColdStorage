import { describe, expect, it } from 'vitest';
import type { DeliveryChallan } from '@cold-storage/contracts';
import {
  calculateConsolidatedGrandTotal,
  calculatePendingAfterPayment,
  getDeliveryRemainingDue,
  isCollectPaymentFormDirty,
  validateCollectPayment,
  type CollectPaymentFormValues,
} from '../collectPayment.helper';

describe('collectPayment.helper', () => {
  describe('calculatePendingAfterPayment', () => {
    it('calculates zero pending after full payment', () => {
      expect(calculatePendingAfterPayment(5000, 5000)).toBe(0);
      expect(calculatePendingAfterPayment(212000, 212000)).toBe(0);
    });

    it('calculates pending balance accurately after partial payment', () => {
      expect(calculatePendingAfterPayment(5000, 2000)).toBe(3000);
      expect(calculatePendingAfterPayment(212000, 100)).toBe(211900);
      expect(calculatePendingAfterPayment(100.5, 50.25)).toBe(50.25);
    });

    it('preserves entire pending balance after zero payment or empty input', () => {
      expect(calculatePendingAfterPayment(5000, 0)).toBe(5000);
      expect(calculatePendingAfterPayment(5000, '')).toBe(5000);
    });

    it('clamps remaining balance to zero if entered amount exceeds balance', () => {
      expect(calculatePendingAfterPayment(5000, 6000)).toBe(0);
    });

    it('returns zero when initial balance is zero', () => {
      expect(calculatePendingAfterPayment(0, 0)).toBe(0);
      expect(calculatePendingAfterPayment(0, '')).toBe(0);
    });
  });

  describe('validateCollectPayment', () => {
    it('accepts valid full payment', () => {
      expect(validateCollectPayment(5000, 5000, 'Cash', '')).toBeNull();
    });

    it('accepts valid partial payment', () => {
      expect(validateCollectPayment(2500, 5000, 'Cash', '')).toBeNull();
    });

    it('accepts zero-amount payment for deferred settlement', () => {
      expect(validateCollectPayment(0, 5000, 'Cash', '')).toBeNull();
    });

    it('rejects negative payment amount', () => {
      expect(validateCollectPayment(-1, 5000, 'Cash', '')).toBe('Payment amount cannot be negative');
    });

    it('rejects non-numeric / empty payment amount', () => {
      expect(validateCollectPayment('', 5000, 'Cash', '')).toBe('Payment amount cannot be negative');
    });

    it('rejects payment amount exceeding remaining balance', () => {
      expect(validateCollectPayment(5001, 5000, 'Cash', '')).toBe(
        'Amount (₹5001) exceeds remaining balance of ₹5000',
      );
    });

    it('rejects UPI mode without transaction reference', () => {
      expect(validateCollectPayment(1000, 5000, 'UPI', '')).toBe(
        'Please enter a UPI transaction reference or ID',
      );
      expect(validateCollectPayment(1000, 5000, 'UPI', '   ')).toBe(
        'Please enter a UPI transaction reference or ID',
      );
    });

    it('accepts UPI mode when valid transaction reference is provided', () => {
      expect(validateCollectPayment(1000, 5000, 'UPI', 'UPI-TXN-987654')).toBeNull();
    });
  });

  describe('isCollectPaymentFormDirty', () => {
    const initial: CollectPaymentFormValues = {
      amount: 5000,
      mode: 'Cash',
      date: '2026-10-12',
      notes: '',
      upiReference: '',
    };

    it('returns false when values match initial state', () => {
      expect(isCollectPaymentFormDirty({ ...initial }, initial)).toBe(false);
    });

    it('returns true when amount is modified', () => {
      expect(isCollectPaymentFormDirty({ ...initial, amount: 2000 }, initial)).toBe(true);
      expect(isCollectPaymentFormDirty({ ...initial, amount: '' }, initial)).toBe(true);
    });

    it('returns true when payment mode is changed', () => {
      expect(isCollectPaymentFormDirty({ ...initial, mode: 'UPI' }, initial)).toBe(true);
    });

    it('returns true when payment date is changed', () => {
      expect(isCollectPaymentFormDirty({ ...initial, date: '2026-10-11' }, initial)).toBe(true);
    });

    it('returns true when notes are entered', () => {
      expect(isCollectPaymentFormDirty({ ...initial, notes: 'Paid by check' }, initial)).toBe(true);
      expect(isCollectPaymentFormDirty({ ...initial, notes: '   ' }, initial)).toBe(false);
    });

    it('returns true when UPI reference is entered', () => {
      expect(isCollectPaymentFormDirty({ ...initial, upiReference: 'REF123' }, initial)).toBe(true);
      expect(isCollectPaymentFormDirty({ ...initial, upiReference: '   ' }, initial)).toBe(false);
    });
  });

  describe('calculateConsolidatedGrandTotal', () => {
    it('returns 0 for empty deliveries array', () => {
      expect(calculateConsolidatedGrandTotal([])).toBe(0);
    });

    it('sums remaining balance across multiple active challans', () => {
      const deliveries = [
        { id: 'd-1', status: 'ISSUED', rentCharge: 100, rentRemainingBalance: 100 } as DeliveryChallan,
        { id: 'd-2', status: 'ISSUED', rentCharge: 100, rentRemainingBalance: 50 } as DeliveryChallan,
        { id: 'd-3', status: 'ISSUED', rentCharge: 50, rentRemainingBalance: 0 } as DeliveryChallan,
        { id: 'd-4', status: 'ISSUED', rentCharge: 200 } as DeliveryChallan, // fallback to rentCharge
      ];
      expect(calculateConsolidatedGrandTotal(deliveries)).toBe(350);
    });

    it('ignores REVERSED deliveries', () => {
      const deliveries = [
        { id: 'd-1', status: 'ISSUED', rentCharge: 100, rentRemainingBalance: 100 } as DeliveryChallan,
        { id: 'd-2', status: 'REVERSED', rentCharge: 500, rentRemainingBalance: 500 } as DeliveryChallan,
      ];
      expect(calculateConsolidatedGrandTotal(deliveries)).toBe(100);
    });
  });

  describe('getDeliveryRemainingDue', () => {
    it('returns rentRemainingBalance if present', () => {
      const d = { id: 'd-1', status: 'ISSUED', rentCharge: 100, rentRemainingBalance: 40 } as DeliveryChallan;
      expect(getDeliveryRemainingDue(d)).toBe(40);
    });

    it('falls back to rentCharge if rentRemainingBalance is undefined', () => {
      const d = { id: 'd-1', status: 'ISSUED', rentCharge: 120 } as DeliveryChallan;
      expect(getDeliveryRemainingDue(d)).toBe(120);
    });

    it('returns 0 if delivery is REVERSED', () => {
      const d = { id: 'd-1', status: 'REVERSED', rentCharge: 100, rentRemainingBalance: 100 } as DeliveryChallan;
      expect(getDeliveryRemainingDue(d)).toBe(0);
    });
  });
});
