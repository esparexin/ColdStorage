import { describe, expect, it } from 'vitest';
import { calculateRentAmount, calculateMonthlyElapsedCycles, resolveControllerRentType, upsertCommodityRateBatchSchema, mergeGrnInputSchema, transferOwnershipInputSchema, grnSchema } from '../index.js';
import { GRN_LIFECYCLE_FIXTURES } from './grn-lifecycle-scenarios.fixtures.js';

describe('GRN lifecycle baseline scenarios (Phase 0)', () => {
  it('covers Kalyan GRN-23/25 and Balaji GRN-26 baselines', () => {
    const numbers = GRN_LIFECYCLE_FIXTURES.map((f) => f.grnNumber);
    expect(numbers).toContain('0023');
    expect(numbers).toContain('0025');
    expect(numbers).toContain('0026');
    expect(GRN_LIFECYCLE_FIXTURES.find((f) => f.grnNumber === '0023')?.bags).toBe(200);
    expect(GRN_LIFECYCLE_FIXTURES.find((f) => f.grnNumber === '0026')?.bags).toBe(100);
  });

  it('seasonal S+B split bills whole-season total without x10', () => {
    expect(calculateRentAmount({
      rentType: 'Seasonal', bags: 100, bagType: 'S+B',
      smallBags: 60, bigBags: 40, smallBagPrice: 10, bigBagPrice: 15, rentMonths: 10,
    })).toBe(1200);
  });

  it('monthly elapsed cycles follow full-cycle rule (same-day=1)', () => {
    expect(calculateMonthlyElapsedCycles('2026-01-01', '2026-01-01')).toBe(1);
    expect(calculateMonthlyElapsedCycles('2026-01-01', '2026-02-01')).toBe(2);
  });

  it('Seasonal_3M shares the Seasonal controller row without becoming Seasonal rent', () => {
    expect(resolveControllerRentType('Seasonal_3M')).toBe('Seasonal');
    expect(resolveControllerRentType('Seasonal')).toBe('Seasonal');
    expect(resolveControllerRentType('Monthly')).toBe('Monthly');
    expect(calculateRentAmount({
      rentType: 'Seasonal_3M', bags: 40, bagType: 'S',
      smallBagPrice: 10, bigBagPrice: 15, rentMonths: 3,
    })).toBe(400);
  });

  it('batch rate schema requires distinct rent types (F2 atomicity)', () => {
    const ok = upsertCommodityRateBatchSchema.safeParse({
      commodityId: 'cmd-1',
      rates: [
        { rentType: 'Seasonal', smallRate: 10, bigRate: 15 },
        { rentType: 'Monthly', smallRate: 12, bigRate: 18 },
      ],
    });
    expect(ok.success).toBe(true);
    const dup = upsertCommodityRateBatchSchema.safeParse({
      commodityId: 'cmd-1',
      rates: [
        { rentType: 'Seasonal', smallRate: 10, bigRate: 15 },
        { rentType: 'Seasonal', smallRate: 11, bigRate: 16 },
      ],
    });
    expect(dup.success).toBe(false);
  });

  it('merge and transfer schemas validate required inputs for full movement', () => {
    const merge = mergeGrnInputSchema.safeParse({
      targetGrnId: 'g-t', sourceGrnIds: ['g-s'], remarks: 'full merge test',
    });
    expect(merge.success).toBe(true);
    const transfer = transferOwnershipInputSchema.safeParse({
      grnId: 'g-1', newCustomerId: 'c-2', remarks: 'full transfer test',
    });
    expect(transfer.success).toBe(true);
  });

  it('validates grnSchema with hamaliRate and hamaliAmount snapshots (positive, zero, null, omitted)', () => {
    const baseGrn = {
      id: 'grn-1',
      facilityId: 'fac-1',
      grnNumber: '1001',
      inwardReceiptNumber: 'RCPT-26-27-1001',
      date: new Date('2026-04-10'),
      customerId: 'cust-1',
      customerName: 'Kalyan',
      commodityId: 'cmd-1',
      commodityName: 'Potato',
      chamber: 'CH-1',
      bags: 100,
      bagType: 'S' as const,
      rentType: 'Seasonal' as const,
      rentAmount: 3000,
      smallBags: 100,
      bigBags: 0,
      status: 'OPEN' as const,
      createdBy: 'usr-1',
    };

    // 1. Positive snapshots
    const parsedWithHamali = grnSchema.safeParse({
      ...baseGrn,
      hamaliRate: 4,
      hamaliAmount: 400,
    });
    expect(parsedWithHamali.success).toBe(true);
    if (parsedWithHamali.success) {
      expect(parsedWithHamali.data.hamaliRate).toBe(4);
      expect(parsedWithHamali.data.hamaliAmount).toBe(400);
    }

    // 2. Zero snapshots (hamali disabled / free handling)
    const parsedZero = grnSchema.safeParse({
      ...baseGrn,
      hamaliRate: 0,
      hamaliAmount: 0,
    });
    expect(parsedZero.success).toBe(true);
    if (parsedZero.success) {
      expect(parsedZero.data.hamaliRate).toBe(0);
      expect(parsedZero.data.hamaliAmount).toBe(0);
    }

    // 3. Null snapshots
    const parsedNull = grnSchema.safeParse({
      ...baseGrn,
      hamaliRate: null,
      hamaliAmount: null,
    });
    expect(parsedNull.success).toBe(true);

    // 4. Omitted snapshots (legacy GRNs)
    const parsedOmitted = grnSchema.safeParse(baseGrn);
    expect(parsedOmitted.success).toBe(true);

    // 5. Negative values rejected
    const parsedNegativeRate = grnSchema.safeParse({
      ...baseGrn,
      hamaliRate: -1,
    });
    expect(parsedNegativeRate.success).toBe(false);

    const parsedNegativeAmount = grnSchema.safeParse({
      ...baseGrn,
      hamaliAmount: -50,
    });
    expect(parsedNegativeAmount.success).toBe(false);
  });
});
