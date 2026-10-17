import { describe, expect, it } from 'vitest';
import {
  buildRentSummary,
  resolveRentGeneratedDate,
} from '../modules/rent/rent-summary.helper.js';
import type { GrnDoc } from '../database/models/grn.model.js';
import type { RentPaymentDoc } from '../database/models/rent-payment.model.js';

describe('Rent Generated Date and Carry-Forward Obligations', () => {
  const baseGrn = {
    id: 'grn-0024',
    grnNumber: '0024',
    facilityId: 'fac-alpha',
    customerId: 'cust-1',
    customerName: 'RamaRao',
    commodityId: 'comm-1',
    commodityName: 'Mirchi',
    chamber: 'B-06,09',
    bags: 100,
    smallBags: 50,
    bigBags: 50,
    bagType: 'S/B' as const,
    date: new Date('2026-10-12'),
    createdAt: new Date('2026-10-12T14:30:00.000Z'),
    rentType: 'Seasonal' as const,
    rentAmount: 0,
    bagPrice: null,
    smallBagPrice: 150,
    bigBagPrice: 210,
    status: 'OPEN' as const,
    loanStatus: 'NONE' as const,
    mergedIntoGrnId: null,
    mergedIntoGrnNumber: null,
    remarks: null,
  } as unknown as GrnDoc;

  describe('resolveRentGeneratedDate SSOT', () => {
    it('1. returns grn.createdAt for upfront stored rent obligation', () => {
      const upfrontDate = new Date('2026-10-10T11:00:00.000Z');
      const genDate = resolveRentGeneratedDate({
        grnRentAmount: 5000,
        grnCreatedAt: upfrontDate,
        outwardRentCharges: 0,
        earliestOutwardCreatedAt: null,
      });
      expect(genDate).toEqual(upfrontDate);
    });

    it('2. returns earliest outward delivery createdAt when rent is generated at outward dispatch', () => {
      const outwardChallanDate = new Date('2026-10-14T09:15:00.000Z');
      const genDate = resolveRentGeneratedDate({
        grnRentAmount: 0,
        grnCreatedAt: new Date('2026-10-12T14:30:00.000Z'), // Inward created earlier
        outwardRentCharges: 2000,
        earliestOutwardCreatedAt: outwardChallanDate,
      });
      expect(genDate).toEqual(outwardChallanDate);
      // Ensures it did NOT substitute the inward creation date
      expect(genDate).not.toEqual(new Date('2026-10-12T14:30:00.000Z'));
    });

    it('3. returns extension finalizedAt when rent obligation is from extension', () => {
      const extDate = new Date('2027-01-15T10:00:00.000Z');
      const genDate = resolveRentGeneratedDate({
        grnRentAmount: 0,
        grnCreatedAt: null,
        outwardRentCharges: 0,
        earliestOutwardCreatedAt: null,
        extensions: [{ finalizedAt: extDate }],
      });
      expect(genDate).toEqual(extDate);
    });

    it('4. returns null (renders —) when no rent has been generated or historical timestamps are absent', () => {
      // "At Outward" with no outward deliveries yet
      const unbilledDate = resolveRentGeneratedDate({
        grnRentAmount: 0,
        grnCreatedAt: new Date('2026-10-12T14:30:00.000Z'),
        outwardRentCharges: 0,
        earliestOutwardCreatedAt: null,
      });
      expect(unbilledDate).toBeNull();

      // Missing persisted createdAt on stored rent
      const missingTimestamp = resolveRentGeneratedDate({
        grnRentAmount: 5000,
        grnCreatedAt: null,
        outwardRentCharges: 0,
        earliestOutwardCreatedAt: null,
      });
      expect(missingTimestamp).toBeNull();
    });
  });

  describe('buildRentSummary for Outward Delivery & Merged GRN workflows', () => {
    it('5. derives outward delivery rent obligation with accurate rentGeneratedDate', () => {
      const outwardCreated = new Date('2026-10-14T10:00:00.000Z');
      const summary = buildRentSummary(
        baseGrn,
        [], // no payments yet
        [], // no extensions
        100, // deliveredBags
        0, // remainingBags
        2000, // outwardRentCharges
        0, // hamaliShare
        outwardCreated,
      );

      expect(summary.totalDue).toBe(2000);
      expect(summary.remainingBalance).toBe(2000);
      expect(summary.paymentStatus).toBe('Not Settled');
      expect(summary.rentGeneratedDate).toEqual(outwardCreated);
      expect(summary.mergedIntoGrnNumber).toBeNull();
    });

    it('6. eliminates double-counting on merged source GRN by transferring balance to target', () => {
      const mergedSourceGrn = {
        ...baseGrn,
        id: 'grn-0034',
        grnNumber: '0034',
        status: 'CLOSED' as const,
        rentAmount: 2000,
        mergedIntoGrnId: 'grn-0020',
        mergedIntoGrnNumber: '0020',
        remarks: '[MERGED into GRN 0020 on 2026-10-15: 100 bags cleared. Financial record preserved]',
      } as unknown as GrnDoc;

      const summary = buildRentSummary(
        mergedSourceGrn,
        [], // no payments made directly on source
        [],
        100,
        0,
        0,
        0,
      );

      // Historical obligation is preserved
      expect(summary.rentAmount).toBe(2000);
      expect(summary.totalPaid).toBe(0);
      // But remaining balance on source is 0 because liability was carried forward to 0020
      expect(summary.remainingBalance).toBe(0);
      expect(summary.paymentStatus).toBe('Settled');
      expect(summary.rentState).toBe('SETTLED');
      expect(summary.mergedIntoGrnNumber).toBe('0020');
      expect(summary.mergedIntoGrnId).toBe('grn-0020');
    });

    it('7. preserves partial payments and historical audit trail for source GRN', () => {
      const partiallyPaidSourceGrn = {
        ...baseGrn,
        id: 'grn-0035',
        grnNumber: '0035',
        status: 'CLOSED' as const,
        rentAmount: 3000,
        mergedIntoGrnId: 'grn-0020',
        mergedIntoGrnNumber: '0020',
      } as unknown as GrnDoc;

      const partialPayment = {
        id: 'rp-1',
        facilityId: 'fac-alpha',
        grnId: 'grn-0035',
        grnNumber: '0035',
        receiptNumber: 'RCPT-001',
        amountPaid: 1000,
        paymentMode: 'Cash' as const,
        paymentDate: new Date('2026-10-10'),
        createdBy: 'usr-admin',
        createdAt: new Date('2026-10-10'),
      } as RentPaymentDoc;

      const summary = buildRentSummary(
        partiallyPaidSourceGrn,
        [partialPayment],
        [],
        100,
        0,
        0,
        0,
      );

      expect(summary.totalPaid).toBe(1000);
      expect(summary.payments).toHaveLength(1);
      expect(summary.payments[0].receiptNumber).toBe('RCPT-001');
      expect(summary.remainingBalance).toBe(0); // Remaining 2,000 was carried forward to target
      expect(summary.paymentStatus).toBe('Settled');
    });

    it('8. preserves original rent generation date across ownership transfer', () => {
      const originalCreatedAt = new Date('2026-10-01T08:00:00.000Z');
      const transferredGrn = {
        ...baseGrn,
        id: 'grn-0011',
        grnNumber: '0011',
        customerId: 'cust-new',
        customerName: 'Transferee Farmer',
        createdAt: originalCreatedAt,
        rentAmount: 5000,
        remarks: '[OWNERSHIP TRANSFERRED on 2026-10-15: Agreed pending rent carried forward]',
      } as unknown as GrnDoc;

      const summary = buildRentSummary(
        transferredGrn,
        [],
        [],
        0,
        100,
        0,
        0,
      );

      expect(summary.customerName).toBe('Transferee Farmer');
      expect(summary.rentAmount).toBe(5000);
      expect(summary.remainingBalance).toBe(5000);
      expect(summary.paymentStatus).toBe('Not Settled');
      // Original bill generation date is preserved, does not invent new bill date on transfer
      expect(summary.rentGeneratedDate).toEqual(originalCreatedAt);
    });
  });
});
