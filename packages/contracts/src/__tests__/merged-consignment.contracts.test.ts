import { describe, expect, it } from 'vitest';
import {
  parseMergedConsignmentBreakdown,
  createDeliverySchema,
  deliveryChallanSchema,
} from '../index.js';

describe('merged-consignment.contracts', () => {
  it('parses GRN 0013 repacked composition into 30 Small, 30 Big and 14 Genesis bags', () => {
    const grn0013Remarks =
      '[MERGE RECEIVED on 2026-10-23: +60 bags (Repacked: 30 S + 30 B = 60 bags). Repacking Hamali: ₹1500 (60 bags @ ₹25/bag) from GRN 0010 (Receipt #RCPT-24-25-0010, Date: 2024-06-10, Customer: Kalyan, Bags: 10, Rent: ₹26100, Paid: ₹0, Balance: ₹26350, Status: Not Settled); GRN 0012 (Receipt #RCPT-25-26-0012, Date: 2025-07-16, Customer: Kalyan, Bags: 12, Rent: ₹13050, Paid: ₹0, Balance: ₹13350, Status: Not Settled). Carried pending rent: ₹39700. Reason: Rebagging as per customer request 2024]';

    const parsed = parseMergedConsignmentBreakdown(grn0013Remarks, 74, 'Balaji');
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    expect(parsed.isMergedTarget).toBe(true);
    expect(parsed.totalMergedAddedBags).toBe(60);
    expect(parsed.genesisBags).toBe(14);
    expect(parsed.genesisCustomerName).toBe('Balaji');

    // Confirmed repacked composition
    expect(parsed.repackedBagType).toBe('S/B');
    expect(parsed.repackedSmallBags).toBe(30);
    expect(parsed.repackedBigBags).toBe(30);
    expect(parsed.repackedHybridBags).toBeNull();
    expect(parsed.repackedStock).toEqual({
      bagType: 'S/B',
      smallBags: 30,
      bigBags: 30,
      quantity: 60,
    });

    // Total stock reconciles: 14 Genesis + 30 Small + 30 Big = 74
    const totalReconciled =
      parsed.genesisBags +
      (parsed.repackedSmallBags ?? 0) +
      (parsed.repackedBigBags ?? 0);
    expect(totalReconciled).toBe(74);
  });

  it('parses confirmed Hybrid merged remarks accurately', () => {
    const hybridRemarks =
      '[MERGE RECEIVED on 2026-10-23: +60 bags (Confirmed Hybrid: 60 bags) from GRN 0008 (Receipt #RCPT-24-25-0008, Bags: 60, Rent: ₹12000, Paid: ₹0, Balance: ₹12000, Status: Not Settled). Reason: Customer Consolidation]';

    const parsed = parseMergedConsignmentBreakdown(hybridRemarks, 74, 'Balaji');
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    expect(parsed.repackedBagType).toBe('Hybrid');
    expect(parsed.repackedHybridBags).toBe(60);
    expect(parsed.repackedSmallBags).toBeNull();
    expect(parsed.repackedBigBags).toBeNull();
    expect(parsed.repackedStock).toEqual({
      bagType: 'Hybrid',
      quantity: 60,
    });
    expect(parsed.genesisBags).toBe(14);
    expect(parsed.genesisBags + (parsed.repackedHybridBags ?? 0)).toBe(74);
  });

  it('validates dual-section outward delivery payload with both Section A and Section B', () => {
    const dualSectionPayload = {
      grnId: 'grn-0013',
      date: new Date(),
      unclassifiedDispatch: {
        bagType: 'S/B' as const,
        smallBags: 10,
        bigBags: 4,
        seasonalBagPrice: 110,
        rentCharge: 1540,
      },
      confirmedDispatch: {
        bagType: 'S/B' as const,
        smallBags: 15,
        bigBags: 15,
        seasonalBagPrice: 110,
        rentCharge: 3300,
      },
      rentCharge: 4840,
      gpNumber: 'GP-0004',
      vehicleNumber: 'UP32AA1111',
      driverName: 'Ramesh Singh',
    };

    const parsed = createDeliverySchema.safeParse(dualSectionPayload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.unclassifiedDispatch?.smallBags).toBe(10);
    expect(parsed.data.unclassifiedDispatch?.bigBags).toBe(4);
    expect(parsed.data.confirmedDispatch?.smallBags).toBe(15);
    expect(parsed.data.confirmedDispatch?.bigBags).toBe(15);
  });

  it('validates dual-section outward challan persistence schema', () => {
    const now = new Date();
    const challanDoc = {
      id: 'del-0013-01',
      facilityId: 'fac-main',
      challanNumber: 'CHL-26-27-0013',
      date: now,
      grnId: 'grn-0013',
      grnNumber: '0013',
      customerId: 'cust-balaji',
      customerName: 'Balaji',
      commodityId: 'comm-mirchi',
      commodityName: 'Mirchi',
      chamber: 'CH A-01,09',
      smallBags: 25,
      bigBags: 19,
      totalBags: 44,
      status: 'ISSUED' as const,
      issuedBy: 'user-op',
      unclassifiedDispatch: {
        bagType: 'S/B' as const,
        smallBags: 10,
        bigBags: 4,
        rentCharge: 1540,
      },
      confirmedDispatch: {
        bagType: 'S/B' as const,
        smallBags: 15,
        bigBags: 15,
        rentCharge: 3300,
      },
      createdAt: now,
      updatedAt: now,
    };

    const parsed = deliveryChallanSchema.safeParse(challanDoc);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.totalBags).toBe(44);
    expect(parsed.data.unclassifiedDispatch?.smallBags).toBe(10);
    expect(parsed.data.confirmedDispatch?.smallBags).toBe(15);
  });

  it('safely parses pathological inputs with extensive whitespace without polynomial backtracking (ReDoS defense)', () => {
    const maliciousRemark1 = '[MERGE RECEIVED on 2026-10-23: +60 bags from GRN -(Date: ' + ' '.repeat(50000);
    const maliciousRemark2 = '[MERGE RECEIVED on 2026-10-23: +60 bags from GRN -(Customer: ' + ' '.repeat(50000);
    const maliciousRemark3 =
      '[MERGE RECEIVED on 2026-10-23: +60 bags from GRN -(Bags:0,Rent:₹0,Paid:₹0,Balance:₹0,Status: ' +
      ' '.repeat(50000);

    const t0 = performance.now();
    expect(parseMergedConsignmentBreakdown(maliciousRemark1, 60, 'Balaji')?.sources).toEqual([]);
    expect(parseMergedConsignmentBreakdown(maliciousRemark2, 60, 'Balaji')?.sources).toEqual([]);
    expect(parseMergedConsignmentBreakdown(maliciousRemark3, 60, 'Balaji')?.sources).toEqual([]);
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(100);
  });
});
