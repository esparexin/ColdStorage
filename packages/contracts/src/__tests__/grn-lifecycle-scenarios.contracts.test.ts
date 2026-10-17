import { describe, expect, it } from 'vitest';
import { calculateRentAmount, calculateMonthlyElapsedCycles, resolveControllerRentType, upsertCommodityRateBatchSchema, mergeGrnInputSchema, transferOwnershipInputSchema } from '../index.js';
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
});
