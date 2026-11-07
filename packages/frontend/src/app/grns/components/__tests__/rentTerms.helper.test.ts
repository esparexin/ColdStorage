import { describe, expect, it } from 'vitest';
import { resolveEffectiveGrnRentType, type Grn } from '@cold-storage/contracts';

describe('GRN Rent Terms Resolution', () => {
  it('resolves GRN 0005 with UTC ISO inward date (2025-12-31T18:30:00.000Z) as Seasonal', () => {
    const grn0005: Pick<Grn, 'rentType' | 'date'> = {
      rentType: 'Monthly',
      date: new Date('2025-12-31T18:30:00.000Z'),
    };

    const effective = resolveEffectiveGrnRentType({
      rentType: grn0005.rentType,
      inwardDate: grn0005.date,
      asOfDate: '2026-11-06',
    });

    expect(effective).toBe('Seasonal');
  });

  it('keeps genuine monthly lot in January as Monthly', () => {
    const effective = resolveEffectiveGrnRentType({
      rentType: 'Monthly',
      inwardDate: '2026-01-05',
      asOfDate: '2026-01-20',
    });

    expect(effective).toBe('Monthly');
  });
});
