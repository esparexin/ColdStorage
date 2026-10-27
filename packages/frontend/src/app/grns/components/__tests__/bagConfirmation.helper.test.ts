import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import { deriveAutoInheritedBagComposition } from '../bagConfirmation.helper';

describe('deriveAutoInheritedBagComposition', () => {
  const buildTestGrn = (patch: Partial<Grn>): Grn => ({
    id: 'g-1',
    grnNumber: '3194',
    customerName: 'B SEENAIAH SDP',
    commodityId: 'c-1',
    commodityName: 'Mirchi',
    chamber: 'A4',
    bags: 10,
    closingBags: 10,
    bagType: 'S',
    smallBags: 10,
    bigBags: 0,
    isCompositionVerified: true,
    rentType: 'Seasonal',
    smallBagPrice: 10,
    bigBagPrice: 15,
    bagPrice: 10,
    date: new Date('2024-03-01'),
    ...patch,
  } as Grn);

  it('inherits 100% Small bags from source lot (matching user screenshot)', () => {
    const source = buildTestGrn({ bags: 10, closingBags: 10, smallBags: 10, bigBags: 0, bagType: 'S' });
    const res = deriveAutoInheritedBagComposition([source], 10);
    expect(res.category).toBe('S/B');
    expect(res.quantity).toBe(10);
    expect(res.smallBags).toBe(10);
    expect(res.bigBags).toBe(0);
    expect(res.seasonalBagPrice).toBe(10);
  });

  it('inherits 100% Big bags when source lot is all Big', () => {
    const source = buildTestGrn({ bags: 10, closingBags: 10, smallBags: 0, bigBags: 10, bagType: 'B' });
    const res = deriveAutoInheritedBagComposition([source], 10);
    expect(res.category).toBe('S/B');
    expect(res.quantity).toBe(10);
    expect(res.smallBags).toBe(0);
    expect(res.bigBags).toBe(10);
    expect(res.seasonalBagPrice).toBe(15);
  });

  it('inherits mixed Small/Big counts across multiple source lots', () => {
    const s1 = buildTestGrn({ id: 'g-1', bags: 6, closingBags: 6, smallBags: 6, bigBags: 0, bagType: 'S' });
    const s2 = buildTestGrn({ id: 'g-2', bags: 4, closingBags: 4, smallBags: 0, bigBags: 4, bagType: 'B' });
    const res = deriveAutoInheritedBagComposition([s1, s2], 10);
    expect(res.category).toBe('S/B');
    expect(res.smallBags).toBe(6);
    expect(res.bigBags).toBe(4);
  });

  it('inherits Hybrid category from Hybrid source lot', () => {
    const source = buildTestGrn({ bags: 10, closingBags: 10, bagType: 'Hybrid', bagPrice: 12 });
    const res = deriveAutoInheritedBagComposition([source], 10);
    expect(res.category).toBe('Hybrid');
    expect(res.quantity).toBe(10);
    expect(res.bagPrice).toBe(12);
  });
});



