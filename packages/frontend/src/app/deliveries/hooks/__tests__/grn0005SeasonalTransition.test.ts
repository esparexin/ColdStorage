import { describe, expect, it } from 'vitest';
import { computeOutwardRentCharge } from '../deliveryRent.helper';
import { calculateOutwardSeasonalBreakdown } from '@cold-storage/contracts';
import { formatSeasonalBreakdownRows } from '../../components/outwardRentBreakdown.helper';

describe('GRN 0005 Seasonal Transition Remediation', () => {
  const inwardDate = '2026-01-01';
  const deliveryDate = '2026-11-02';
  const monthlyRates = { small: 45, big: 65 };
  const seasonalRates = { small: 125, big: 205 }; // Gross rate inclusive of ₹25 hamali: net is 100 / 180

  it('calculates 1 month monthly rent for January-only outward delivery', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Monthly',
      bagCategory: 'Small & Big',
      smallBags: 1,
      bigBags: 1,
      smallBagPrice: 45,
      bigBagPrice: 65,
      inwardDate: '2026-01-01',
      deliveryDate: '2026-01-20',
      rentMonths: 1,
    });
    // 1 small * 45 + 1 big * 65 = 110
    expect(rent).toBe(110);
  });

  it('calculates 2 months monthly rent for February outward delivery', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Monthly',
      bagCategory: 'Small & Big',
      smallBags: 1,
      bigBags: 1,
      smallBagPrice: 45,
      bigBagPrice: 65,
      inwardDate: '2026-01-01',
      deliveryDate: '2026-02-20',
      rentMonths: 2,
    });
    // (1 * 45 + 1 * 65) * 2 = 220
    expect(rent).toBe(220);
  });

  it('GRN 0005: transitions to Jan-Feb (2mo) + Mar-Dec Full Seasonal rent instead of 11 monthly cycles', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Monthly',
      bagCategory: 'Small & Big',
      smallBags: 1,
      bigBags: 1,
      smallBagPrice: seasonalRates.small,
      bigBagPrice: seasonalRates.big,
      monthlySmallBagPrice: monthlyRates.small,
      monthlyBigBagPrice: monthlyRates.big,
      inwardDate,
      deliveryDate,
      rentMonths: 11,
      hamaliRate: 25,
      hasSeasonalRates: true,
    });
    // Jan-Feb = (1 * 45 + 1 * 65) * 2 = 220
    // Season 2026 storage = 1 * (125 - 25) + 1 * (205 - 25) = 280
    // Total Storage Rent = 500 (NOT 1,210)
    expect(rent).toBe(500);
  });

  it('GRN 0005 breakdown rows: formats Jan-Feb combined + (2026) Mar - Dec seasonal rows', () => {
    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate,
      smallBags: 1,
      bigBags: 1,
      seasonalRates,
      monthlyRates,
      hamaliRate: 25,
    });
    expect(breakdown.storageRent).toBe(500);
    expect(breakdown.hamaliAmount).toBe(50);
    expect(breakdown.totalAmount).toBe(550);

    const rows = formatSeasonalBreakdownRows({
      periods: breakdown.periods,
      isHybrid: false,
      totalWithdrawing: 2,
      hamaliRate: 25,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0].title).toBe('Jan - Feb');
    expect(rows[0].details).toContain('(2 months)');
    expect(rows[0].amount).toBe(220);

    expect(rows[1].title).toBe('(2026) Mar - Dec');
    expect(rows[1].amount).toBe(280);

    expect(rows[2].title).toBe('Hamali Charges');
    expect(rows[2].amount).toBe(50);
  });

  it('GRN 0005 Hybrid: transitions Jan inward delivery to Jan-Feb + Mar-Dec Seasonal', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Monthly',
      bagCategory: 'Hybrid',
      quantity: 5,
      seasonalBagPrice: 100,
      monthlyBagPrice: 45,
      inwardDate,
      deliveryDate,
      rentMonths: 11,
      hasSeasonalRates: true,
    });
    // Jan-Feb = 5 * 45 * 2 = 450
    // Mar-Dec = 5 * 100 = 500
    // Total = 950 (NOT 5 * 45 * 11 = 2,475)
    expect(rent).toBe(950);
  });
});
