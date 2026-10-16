import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import { mergeOpenGrnsPool } from '../useOpenFacilityGrns';

describe('useOpenFacilityGrns - mergeOpenGrnsPool', () => {
  const partialGrn0032: Grn = {
    id: 'grn-0032',
    facilityId: 'fac-1',
    grnNumber: '0032',
    date: new Date('2024-06-12'),
    customerId: 'cust-kalyan',
    customerName: 'Kalyan',
    commodityId: 'cmd-mirchi',
    commodityName: 'Mirchi',
    chamber: 'CH-1',
    bags: 2,
    netDeliveredBags: 1,
    closingBags: 1,
    bagType: 'S/B',
    smallBags: 2,
    bigBags: 0,
    rentType: 'Seasonal',
    rentAmount: 300,
    status: 'OPEN',
    inwardReceiptNumber: 'IRN-0032',
    createdBy: 'admin',
    createdAt: new Date('2024-06-12'),
  };

  const activeGrn0031: Grn = {
    id: 'grn-0031',
    facilityId: 'fac-1',
    grnNumber: '0031',
    date: new Date('2026-03-01'),
    customerId: 'cust-nitish',
    customerName: 'Nitish',
    commodityId: 'cmd-mirchi',
    commodityName: 'Mirchi',
    chamber: 'CH-2',
    bags: 15,
    netDeliveredBags: 0,
    closingBags: 15,
    bagType: 'S/B',
    smallBags: 15,
    bigBags: 0,
    rentType: 'Seasonal',
    rentAmount: 7000,
    status: 'OPEN',
    inwardReceiptNumber: 'IRN-0031',
    createdBy: 'admin',
    createdAt: new Date('2026-03-01'),
  };

  it('unifies partial caller GRN with active facility GRNs', () => {
    // When opened from Partial tab, initialGrns contains only [partialGrn0032]
    const initialGrns = [partialGrn0032];
    // Facility-wide fetch returns both active and partial open GRNs
    const facilityOpenGrns = [activeGrn0031, partialGrn0032];

    const pool = mergeOpenGrnsPool(partialGrn0032, initialGrns, facilityOpenGrns);

    expect(pool).toHaveLength(2);
    expect(pool.map((g) => g.grnNumber)).toEqual(['0032', '0031']);
  });

  it('guarantees current GRN is present even if absent from initial or facility lists', () => {
    const pool = mergeOpenGrnsPool(partialGrn0032, [], [activeGrn0031]);

    expect(pool).toHaveLength(2);
    expect(pool.some((g) => g.id === 'grn-0032')).toBe(true);
    expect(pool.some((g) => g.id === 'grn-0031')).toBe(true);
  });

  it('deduplicates duplicate records across lists by GRN ID', () => {
    const duplicateList = [partialGrn0032, partialGrn0032, activeGrn0031];
    const pool = mergeOpenGrnsPool(partialGrn0032, duplicateList, duplicateList);

    expect(pool).toHaveLength(2);
  });
});
