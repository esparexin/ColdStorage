import { describe, expect, it } from 'vitest';
import { rentReceiptDocumentDtoSchema } from '../documents.js';
import {
  paymentModeSchema,
  paymentStatusSchema,
  recordRentPaymentInputSchema,
  rentPaymentSchema,
  rentSummaryDtoSchema,
  calculateSeasonalOccupancy,
  seasonalOccupancySummarySchema,
} from '../rent.js';

describe('Phase 12: Rent Collection & Billing Contracts', () => {
  it('1. validates valid payment input schema with Cash and UPI payment modes', () => {
    const cashInput = {
      grnId: 'grn-123',
      amountPaid: 1500,
      paymentMode: 'Cash',
      paymentDate: new Date(),
      notes: 'Initial cash installment',
    };
    const upiInput = {
      grnId: 'grn-123',
      amountPaid: 3500.5,
      paymentMode: 'UPI',
      paymentDate: new Date(),
    };

    expect(recordRentPaymentInputSchema.safeParse(cashInput).success).toBe(true);
    expect(recordRentPaymentInputSchema.safeParse(upiInput).success).toBe(true);
  });

  it('2. rejects invalid payment mode (e.g. BankTransfer, Cheque, Card)', () => {
    const invalidModes = ['BankTransfer', 'Cheque', 'Card', 'DemandDraft', 'NEFT'];
    for (const mode of invalidModes) {
      const res = recordRentPaymentInputSchema.safeParse({
        grnId: 'grn-123',
        amountPaid: 1000,
        paymentMode: mode,
      });
      expect(res.success).toBe(false);
      expect(paymentModeSchema.safeParse(mode).success).toBe(false);
    }
  });

  it('3. rejects zero or negative payment amounts', () => {
    const invalidAmounts = [0, -1, -500, -0.01];
    for (const amt of invalidAmounts) {
      const res = recordRentPaymentInputSchema.safeParse({
        grnId: 'grn-123',
        amountPaid: amt,
        paymentMode: 'Cash',
      });
      expect(res.success).toBe(false);
    }
  });

  it('4. rejects future payment dates beyond 5-minute skew tolerance in Asia/Kolkata', () => {
    const now = Date.now();
    // 4 minutes in the future -> allowed by tolerance
    const allowedFuture = new Date(now + 4 * 60 * 1000);
    expect(
      recordRentPaymentInputSchema.safeParse({
        grnId: 'grn-123',
        amountPaid: 1000,
        paymentMode: 'Cash',
        paymentDate: allowedFuture,
      }).success,
    ).toBe(true);

    // 10 minutes in the future -> rejected
    const excessiveFuture = new Date(now + 10 * 60 * 1000);
    const res = recordRentPaymentInputSchema.safeParse({
      grnId: 'grn-123',
      amountPaid: 1000,
      paymentMode: 'Cash',
      paymentDate: excessiveFuture,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.paymentDate?.[0]).toContain('future');
    }
  });

  it('5. validates RentSummaryDto schema correctly computes derived fields', () => {
    const validSummary = {
      grnId: 'grn-101',
      grnNumber: 'GRN-26-27-0001',
      facilityId: 'fac-alpha',
      customerId: 'cust-1',
      customerName: 'Ramesh Patel',
      commodityName: 'Potatoes',
      chamber: 'CH-1',
      inwardDate: new Date('2026-05-10'),
      totalBags: 500,
      rentType: 'Seasonal',
      rentAmount: 25000,
      rentMonths: 10,
      totalPaid: 15000,
      remainingBalance: 10000,
      paymentStatus: 'Not Settled',
      payments: [
        {
          id: 'rp-1',
          facilityId: 'fac-alpha',
          grnId: 'grn-101',
          grnNumber: 'GRN-26-27-0001',
          receiptNumber: 'RCPT-26-27-0001',
          amountPaid: 15000,
          paymentMode: 'Cash',
          paymentDate: new Date('2026-05-10'),
          notes: null,
          createdBy: 'usr-operator-1',
          createdAt: new Date('2026-05-10'),
        },
      ],
    };

    expect(rentSummaryDtoSchema.safeParse(validSummary).success).toBe(true);
    expect(rentPaymentSchema.safeParse(validSummary.payments[0]).success).toBe(true);
    expect(paymentStatusSchema.safeParse('Settled').success).toBe(true);
    expect(paymentStatusSchema.safeParse('Not Settled').success).toBe(true);
    expect(paymentStatusSchema.safeParse('PARTIAL').success).toBe(false);
  });

  it('6. validates RentReceiptDocumentDto schema', () => {
    const validDocDto = {
      organization: {
        orgName: 'Cold Storage Ltd',
        address: '123 Market Rd',
        contact: '9999999999',
        gstin: '27AAAAA0000A1Z5',
        logoAssetId: null,
        printFooter: 'Thank you for your business',
        timezone: 'Asia/Kolkata',
      },
      facility: {
        facilityId: 'fac-alpha',
        facilityName: 'Facility Alpha',
        facilityCode: 'FA',
        facilityAddress: 'Sector 5 Industrial',
      },
      receiptNumber: 'RCPT-26-27-0001',
      grnNumber: 'GRN-26-27-0001',
      date: new Date('2026-05-10'),
      customerName: 'Ramesh Patel',
      commodityName: 'Potatoes',
      chamber: 'CH-1',
      totalRentObligation: 25000,
      amountPaid: 25000,
      paymentMode: 'UPI',
      remainingBalance: 0,
      paymentStatus: 'Settled',
      notes: 'Full payment via UPI',
      generatedAt: new Date(),
      generatedBy: 'Operator Alpha',
    };

    expect(rentReceiptDocumentDtoSchema.safeParse(validDocDto).success).toBe(true);
  });

  it('7. calculates seasonal storage occupancy consuming canonical movement history', () => {
    const inwardDate = new Date('2026-04-15T00:00:00.000Z');
    const jul10 = new Date('2026-07-10T10:00:00.000Z');
    const nov10 = new Date('2026-11-10T10:00:00.000Z');

    const summary = calculateSeasonalOccupancy({
      grnId: 'grn-season-1',
      facilityId: 'fac-alpha',
      grnNumber: 'GRN-26-27-0099',
      inwardDate,
      totalBags: 100,
      bagRate: 15,
      seasonName: 'Season 2026-2027',
      seasonStart: new Date('2026-04-01'),
      seasonEnd: new Date('2027-01-31'),
      movements: [
        { date: jul10, type: 'PARTIAL_OUTWARD', deliveredBags: 40, closingBags: 60 },
        { date: nov10, type: 'FINAL_OUTWARD', deliveredBags: 60, closingBags: 0 },
      ],
    });

    expect(summary.grnId).toBe('grn-season-1');
    expect(summary.seasonName).toBe('Season 2026-2027');
    expect(summary.totalInwardBags).toBe(100);
    expect(summary.netDeliveredBags).toBe(100);
    expect(summary.remainingBags).toBe(0);
    expect(summary.status).toBe('CLOSED');
    expect(summary.finalOutwardDate).toEqual(nov10);
    // 100 bags × ₹15/bag/mo × 10 months = ₹15,000
    expect(summary.calculatedCharge).toBe(15000);
    expect(seasonalOccupancySummarySchema.safeParse(summary).success).toBe(true);
  });
});
