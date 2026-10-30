import { describe, expect, it } from 'vitest';
import type { CommodityRate } from '@cold-storage/contracts';
import { resolveTransferRates } from '../transferRentRates.helper';

describe('resolveTransferRates', () => {
  it('preserves agreed rates on GRN', () => {
    const res = resolveTransferRates({
      rentType: 'Seasonal',
      smallBagPrice: 20,
      bigBagPrice: 30,
      bagPrice: null,
    });
    expect(res.seasonalRates).toEqual({ small: 20, big: 30 });
    expect(res.monthlyRates).toEqual({ small: 20, big: 30 });
  });

  it('uses commodity active Seasonal and Monthly rates when GRN has no agreed rates', () => {
    const rates: CommodityRate[] = [
      {
        id: 'crt-1',
        commodityId: 'cmd-1',
        rentType: 'Seasonal',
        smallRate: 14,
        bigRate: 18,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'crt-2',
        commodityId: 'cmd-1',
        rentType: 'Monthly',
        smallRate: 5,
        bigRate: 7,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const res = resolveTransferRates(
      {
        rentType: 'Seasonal',
        smallBagPrice: null,
        bigBagPrice: null,
        bagPrice: null,
      },
      { rates },
    );

    // Root-cause fix verification: Must NOT fall back to 10/15!
    expect(res.seasonalRates).toEqual({ small: 14, big: 18 });
    expect(res.monthlyRates).toEqual({ small: 5, big: 7 });
  });

  it('uses commodity monthly rate for extensions even when GRN has agreed seasonal rate', () => {
    const rates: CommodityRate[] = [
      {
        id: 'crt-2',
        commodityId: 'cmd-1',
        rentType: 'Monthly',
        smallRate: 6,
        bigRate: 9,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const res = resolveTransferRates(
      {
        rentType: 'Seasonal',
        smallBagPrice: 16,
        bigBagPrice: 22,
        bagPrice: null,
      },
      { rates },
    );

    expect(res.seasonalRates).toEqual({ small: 16, big: 22 });
    expect(res.monthlyRates).toEqual({ small: 6, big: 9 });
  });

  it('ignores inactive commodity rates', () => {
    const rates: CommodityRate[] = [
      {
        id: 'crt-inactive',
        commodityId: 'cmd-1',
        rentType: 'Seasonal',
        smallRate: 99,
        bigRate: 99,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const res = resolveTransferRates(
      {
        rentType: 'Seasonal',
        smallBagPrice: null,
        bigBagPrice: null,
        bagPrice: null,
      },
      { rates },
    );

    // Falls back to canonical 10/15 because commodity rate is inactive
    expect(res.seasonalRates).toEqual({ small: 10, big: 15 });
  });

  it('falls back to canonical reference rates when no agreed rates and no commodity rates exist', () => {
    const res = resolveTransferRates({
      rentType: 'Seasonal',
      smallBagPrice: null,
      bigBagPrice: null,
      bagPrice: null,
    });
    expect(res.seasonalRates).toEqual({ small: 10, big: 15 });
    expect(res.monthlyRates).toEqual({ small: 10, big: 15 });
  });
});

