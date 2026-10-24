import { describe, expect, it } from 'vitest';
import type { DeliveryChallan, MergedConsignmentBreakdown } from '@cold-storage/contracts';
import { calculateRemainingMergedStockPools } from '../mergedStockPools.helper';

describe('calculateRemainingMergedStockPools', () => {
  const grn0013Breakdown: MergedConsignmentBreakdown = {
    isMergedTarget: true,
    totalMergedAddedBags: 60,
    genesisBags: 14,
    repackedSmallBags: 30,
    repackedBigBags: 30,
    repackedHybridBags: 0,
    repackedBagType: 'S/B',
    totalCarriedRent: 39700,
    totalSeparateSourceRent: 0,
    sources: [],
  };

  it('returns null if not a merged consignment', () => {
    expect(calculateRemainingMergedStockPools(null, [])).toBeNull();
    expect(
      calculateRemainingMergedStockPools(
        { ...grn0013Breakdown, isMergedTarget: false },
        [],
      ),
    ).toBeNull();
    expect(
      calculateRemainingMergedStockPools(
        { ...grn0013Breakdown, totalMergedAddedBags: 0 },
        [],
      ),
    ).toBeNull();
  });

  it('accurately resolves initial pools with no prior dispatches for GRN 0013', () => {
    const pools = calculateRemainingMergedStockPools(grn0013Breakdown, []);
    expect(pools).not.toBeNull();
    expect(pools?.isMerged).toBe(true);
    expect(pools?.initialUnclassified).toBe(14);
    expect(pools?.availableUnclassified).toBe(14);
    expect(pools?.availableConfirmedSmall).toBe(30);
    expect(pools?.availableConfirmedBig).toBe(30);
    expect(pools?.availableConfirmedTotal).toBe(60);
    expect(pools?.totalAvailable).toBe(74);
  });

  it('deducts prior unclassified and confirmed dispatches to derive remaining stock', () => {
    const priorDeliveries: DeliveryChallan[] = [
      {
        id: 'del-1',
        facilityId: 'fac-1',
        challanNumber: 'DC-001',
        date: new Date('2026-10-24'),
        grnId: 'grn-0013',
        grnNumber: '0013',
        customerId: 'c-1',
        customerName: 'Balaji',
        commodityId: 'cmd-1',
        commodityName: 'Mirchi',
        chamber: 'A-01',
        bagType: 'S/B',
        smallBags: 25,
        bigBags: 19,
        totalBags: 44,
        status: 'ISSUED',
        unclassifiedDispatch: {
          bagType: 'S/B',
          smallBags: 10,
          bigBags: 4,
          seasonalBagPrice: 110,
        },
        confirmedDispatch: {
          bagType: 'S/B',
          smallBags: 15,
          bigBags: 15,
          seasonalBagPrice: 110,
        },
      },
    ];

    const pools = calculateRemainingMergedStockPools(grn0013Breakdown, priorDeliveries);
    expect(pools?.availableUnclassified).toBe(0);
    expect(pools?.availableConfirmedSmall).toBe(15);
    expect(pools?.availableConfirmedBig).toBe(15);
    expect(pools?.availableConfirmedTotal).toBe(30);
    expect(pools?.totalAvailable).toBe(30);
  });

  it('ignores reversed delivery challans', () => {
    const priorDeliveries: DeliveryChallan[] = [
      {
        id: 'del-rev',
        facilityId: 'fac-1',
        challanNumber: 'DC-REV',
        date: new Date('2026-10-24'),
        grnId: 'grn-0013',
        grnNumber: '0013',
        customerId: 'c-1',
        customerName: 'Balaji',
        commodityId: 'cmd-1',
        commodityName: 'Mirchi',
        chamber: 'A-01',
        bagType: 'S/B',
        smallBags: 25,
        bigBags: 19,
        totalBags: 44,
        status: 'REVERSED',
        unclassifiedDispatch: {
          bagType: 'S/B',
          smallBags: 10,
          bigBags: 4,
          seasonalBagPrice: 110,
        },
        confirmedDispatch: {
          bagType: 'S/B',
          smallBags: 15,
          bigBags: 15,
          seasonalBagPrice: 110,
        },
      },
    ];

    const pools = calculateRemainingMergedStockPools(grn0013Breakdown, priorDeliveries);
    expect(pools?.availableUnclassified).toBe(14);
    expect(pools?.availableConfirmedSmall).toBe(30);
    expect(pools?.availableConfirmedBig).toBe(30);
    expect(pools?.totalAvailable).toBe(74);
  });
});
