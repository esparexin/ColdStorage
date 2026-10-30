import { describe, expect, it } from 'vitest';
import {
  calculateHamaliAmount,
  resolveTotalRentObligation,
  type Commodity,
  type Grn,
} from '@cold-storage/contracts';

describe('Transfer Ownership: Hamali Rate Resolution and Obligation Alignment', () => {
  it('resolves effective hamali rate from grn snapshot when present', () => {
    const grn: Partial<Grn> = {
      id: 'grn-1',
      hamaliRate: 5,
      commodityId: 'cmd-1',
    };
    const commodity: Partial<Commodity> = {
      id: 'cmd-1',
      isHamaliApplicable: true,
      hamaliRate: 10, // Master changed, but snapshot must win
    };

    const effectiveRate = typeof grn.hamaliRate === 'number'
      ? grn.hamaliRate
      : (commodity.isHamaliApplicable ? (commodity.hamaliRate ?? 0) : 0);

    expect(effectiveRate).toBe(5);
  });

  it('falls back to commodity master when grn has no hamali snapshot', () => {
    const grn: Partial<Grn> = {
      id: 'grn-legacy',
      hamaliRate: null,
      commodityId: 'cmd-1',
    };
    const commodity: Partial<Commodity> = {
      id: 'cmd-1',
      isHamaliApplicable: true,
      hamaliRate: 4.5,
    };

    const effectiveRate = typeof grn.hamaliRate === 'number'
      ? grn.hamaliRate
      : (commodity.isHamaliApplicable ? (commodity.hamaliRate ?? 0) : 0);

    expect(effectiveRate).toBe(4.5);
  });

  it('resolves zero hamali rate when commodity has isHamaliApplicable false', () => {
    const grn: Partial<Grn> = {
      id: 'grn-no-hamali',
      commodityId: 'cmd-2',
    };
    const commodity: Partial<Commodity> = {
      id: 'cmd-2',
      isHamaliApplicable: false,
      hamaliRate: 10,
    };

    const effectiveRate = typeof grn.hamaliRate === 'number'
      ? grn.hamaliRate
      : (commodity.isHamaliApplicable ? (commodity.hamaliRate ?? 0) : 0);

    expect(effectiveRate).toBe(0);
  });

  it('accurately computes hamali amount using contracts calculateHamaliAmount', () => {
    expect(calculateHamaliAmount(17, 5)).toBe(85);
    expect(calculateHamaliAmount(100, 4.5)).toBe(450);
    expect(calculateHamaliAmount(17, 0)).toBe(0);
  });

  it('joins hamali share into resolveTotalRentObligation matching backend calculation', () => {
    const assessedRent = 6460;
    const hamaliRate = 5;
    const remainingBags = 17;
    const hamaliAmount = calculateHamaliAmount(remainingBags, hamaliRate); // 85

    const storedRent = 0; // Unbilled / at outward transfer
    const effectiveBaseRent = storedRent > 0
      ? (storedRent > assessedRent ? storedRent : assessedRent)
      : assessedRent;

    const totalObligation = resolveTotalRentObligation({
      rentType: 'Seasonal',
      rentAmount: effectiveBaseRent,
      outwardRentCharges: 0,
      hamaliShare: hamaliAmount,
    });

    expect(totalObligation).toBe(6460 + 85); // 6545
  });
});

