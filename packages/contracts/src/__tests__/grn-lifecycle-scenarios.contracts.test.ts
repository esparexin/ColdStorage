import { describe, expect, it } from 'vitest';
import { calculateRentAmount, calculateMonthlyElapsedCycles } from '../index.js';
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
});
