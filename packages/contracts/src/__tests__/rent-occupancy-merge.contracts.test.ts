import { describe, expect, it } from 'vitest';
import {
  mergedConsignmentBreakdownSchema,
  parseMergedConsignmentBreakdown,
  calculateSeasonalOccupancy,
  seasonalOccupancySummarySchema,
  rentSummaryDtoSchema,
} from '../rent.js';

describe('Phase 12: Rent Occupancy & Merged Consignment Contracts', () => {
  it('1. calculates seasonal storage occupancy consuming canonical movement history', () => {
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
    // 100 bags × ₹15 whole-season total = ₹1,500 (never ×10)
    expect(summary.calculatedCharge).toBe(1500);
    expect(seasonalOccupancySummarySchema.safeParse(summary).success).toBe(true);
  });

  it('2. derives default seasonal boundaries (March 1 to Dec 31) and seasonal year naming', () => {
    const inwardDate = new Date('2026-03-15T00:00:00.000Z');
    const summary = calculateSeasonalOccupancy({
      grnId: 'grn-season-default',
      facilityId: 'fac-alpha',
      grnNumber: 'GRN-26-27-0100',
      inwardDate,
      totalBags: 200,
      bagRate: 10,
      movements: [],
    });

    expect(summary.seasonName).toBe('Season 2026');
    expect(summary.seasonStart.getMonth()).toBe(2); // March
    expect(summary.seasonStart.getDate()).toBe(1);
    expect(summary.seasonEnd.getMonth()).toBe(11); // December
    expect(summary.seasonEnd.getDate()).toBe(31);
    expect(summary.calculatedCharge).toBe(2000);
    expect(seasonalOccupancySummarySchema.safeParse(summary).success).toBe(true);
  });

  it('3. parses authoritative merge remarks into MergedConsignmentBreakdown using parseMergedConsignmentBreakdown', () => {
    const mergeRemarks =
      '[MERGE RECEIVED on 2026-07-15: +50 bags (Repacked: 30 S + 20 B = 50 bags). Repacking Hamali: ₹300 (50 bags @ ₹6/bag) from GRN 0042 (Receipt #RCPT-26-27-0042, Date: 2026-06-01, Customer: Suresh Kumar, Bags: 50, Rent: ₹1500, Paid: ₹500, Balance: ₹1000, Status: Not Settled). Additional rent: ₹1000. Source pending rent: ₹1000 kept as separate pending bills. Reason: Seasonal Consolidation]';

    const parsed = parseMergedConsignmentBreakdown(mergeRemarks, 150, 'Ramesh Patel');
    expect(parsed).not.toBeNull();
    expect(parsed?.isMergedTarget).toBe(true);
    expect(parsed?.totalMergedAddedBags).toBe(50);
    expect(parsed?.genesisBags).toBe(100);
    expect(parsed?.genesisCustomerName).toBe('Ramesh Patel');
    expect(parsed?.repackHamali).toEqual({
      amount: 300,
      repackBags: 50,
      ratePerBag: 6,
    });
    expect(parsed?.totalCarriedRent).toBe(1000);
    expect(parsed?.totalSeparateSourceRent).toBe(1000);
    expect(parsed?.sources).toHaveLength(1);
    expect(parsed?.sources[0]).toEqual({
      grnNumber: '0042',
      receiptNumber: 'RCPT-26-27-0042',
      dateStr: '2026-06-01',
      seasonYear: 2026,
      customerName: 'Suresh Kumar',
      bags: 50,
      rentAmount: 1500,
      amountPaid: 500,
      remainingBalance: 1000,
      status: 'Not Settled',
    });

    expect(mergedConsignmentBreakdownSchema.safeParse(parsed).success).toBe(true);
  });

  it('4. validates RentSummaryDto schema with structured mergedConsignment breakdown', () => {
    const summaryWithMerge = {
      grnId: 'grn-target-1',
      grnNumber: 'GRN-26-27-0010',
      facilityId: 'fac-alpha',
      customerId: 'cust-1',
      customerName: 'Ramesh Patel',
      commodityName: 'Potatoes',
      chamber: 'CH-1',
      inwardDate: new Date('2026-05-10'),
      totalBags: 150,
      rentType: 'Seasonal',
      rentAmount: 4500,
      totalPaid: 1500,
      remainingBalance: 3000,
      paymentStatus: 'Not Settled',
      rentState: 'PENDING',
      payments: [],
      extensions: [],
      totalDue: 4500,
      mergedConsignment: {
        isMergedTarget: true,
        totalMergedAddedBags: 50,
        repackHamali: {
          repackBags: 50,
          ratePerBag: 6,
          amount: 300,
        },
        totalCarriedRent: 1000,
        totalSeparateSourceRent: 1000,
        sources: [
          {
            grnNumber: '0042',
            receiptNumber: 'RCPT-26-27-0042',
            dateStr: '2026-06-01',
            seasonYear: 2026,
            customerName: 'Suresh Kumar',
            bags: 50,
            rentAmount: 1500,
            amountPaid: 500,
            remainingBalance: 1000,
            status: 'Not Settled',
          },
        ],
        genesisBags: 100,
        genesisCustomerName: 'Ramesh Patel',
      },
    };

    const res = rentSummaryDtoSchema.safeParse(summaryWithMerge);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.mergedConsignment?.isMergedTarget).toBe(true);
      expect(res.data.mergedConsignment?.sources[0].grnNumber).toBe('0042');
    }
  });
});
