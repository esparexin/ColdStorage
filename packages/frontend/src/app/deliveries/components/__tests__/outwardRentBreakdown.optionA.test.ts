import { describe, expect, it } from 'vitest';
import {
  calculateOutwardSeasonalBreakdown,
  resolveDiscriminatedOutwardRates,
  type DiscriminatedOutwardPricing,
} from '@cold-storage/contracts';
import {
  formatSeasonalBreakdownRows,
} from '../outwardRentBreakdown.helper';

describe('Option A Path 2 - Outward Rent Calculation Breakdown (User Screenshot Scenario)', () => {
  // Exact scenario from the user screenshot:
  // GRN: 0023, Inward: 20 Mar 2024, Delivery: 31 Oct 2026
  // Bag Type: Small & Big (S/B)
  // Withdrawn: 1 Small Bag, 1 Big Bag (Total 2 bags)
  // Inclusive Rates: Small ₹110, Big ₹185, Hamali: ₹25
  // Monthly Rates: Small ₹30, Big ₹40
  const inwardDate = '2024-03-20';
  const deliveryDate = '2026-10-31';
  const smallBags = 1;
  const bigBags = 1;
  const totalWithdrawing = smallBags + bigBags;
  const hamaliRate = 25;
  const seasonalRates = { small: 110, big: 185 };
  const monthlyRates = { small: 30, big: 40 };

  it('calculates exact net storage rent of ₹1,015, hamali of ₹50, and total amount to pay of ₹1,065', () => {
    const pricing: DiscriminatedOutwardPricing = {
      isHybrid: false,
      seasonalRates,
      monthlyRates,
      smallBags,
      bigBags,
    };

    const resolved = resolveDiscriminatedOutwardRates(pricing);
    expect(resolved.isHybrid).toBe(false);
    expect(resolved.smallBags).toBe(1);
    expect(resolved.bigBags).toBe(1);

    // Call breakdown with hamaliRate passed as now wired in OutwardRentBreakdown
    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate,
      smallBags: resolved.smallBags,
      bigBags: resolved.bigBags,
      seasonalRates: resolved.effectiveSeasonalRates,
      monthlyRates: resolved.effectiveMonthlyRates,
      hamaliRate,
    });

    // 1. Storage Rent must Derives from Net Storage Rates (Small ₹85, Big ₹160):
    // Season 2024: 1*85 + 1*160 = 245
    // Jan-Feb 2025: 1*60 + 1*80 = 140
    // Season 2025: 1*85 + 1*160 = 245
    // Jan-Feb 2026: 1*60 + 1*80 = 140
    // Season 2026: 1*85 + 1*160 = 245
    // Total Storage Rent = 245 + 140 + 245 + 140 + 245 = 1,015.00 (NOT ₹1,165)
    expect(breakdown.storageRent).toBe(1015);
    expect(breakdown.totalRent).toBe(1015);

    // 2. Hamali Amount = 2 bags * ₹25 = 50.00
    expect(breakdown.hamaliAmount).toBe(50);

    // 3. Total Amount to Pay = ₹1,015 + ₹50 = ₹1,065.00 (NOT ₹1,215)
    expect(breakdown.totalAmount).toBe(1065);

    // 4. Formatted Display Rows for the modal
    const rows = formatSeasonalBreakdownRows({
      periods: breakdown.periods,
      isHybrid: false,
      totalWithdrawing,
      hamaliRate,
    });

    expect(rows).toHaveLength(6); // 5 periods (2024, Jan-Feb 25, 2025, Jan-Feb 26, 2026) + 1 hamali row

    // Season 2024 row
    expect(rows[0].title).toBe('(2024) Mar - Dec');
    expect(rows[0].details).toBe('1 Small × ₹85 (₹85) + 1 Big × ₹160 (₹160)');
    expect(rows[0].amount).toBe(245);

    // Jan-Feb 2025 row
    expect(rows[1].title).toBe('(2025) Jan - Feb');
    expect(rows[1].details).toBe('1 Small × ₹60.00 (₹60) + 1 Big × ₹80.00 (₹80) (2 months)');
    expect(rows[1].amount).toBe(140);

    // Season 2025 row - uses Net Storage Rates!
    expect(rows[2].title).toBe('(2025) Mar - Dec');
    expect(rows[2].details).toBe('1 Small × ₹85 (₹85) + 1 Big × ₹160 (₹160)');
    expect(rows[2].amount).toBe(245);

    // Jan-Feb 2026 row
    expect(rows[3].title).toBe('(2026) Jan - Feb');
    expect(rows[3].details).toBe('1 Small × ₹60.00 (₹60) + 1 Big × ₹80.00 (₹80) (2 months)');
    expect(rows[3].amount).toBe(140);

    // Season 2026 row - uses Net Storage Rates!
    expect(rows[4].title).toBe('(2026) Mar - Dec');
    expect(rows[4].details).toBe('1 Small × ₹85 (₹85) + 1 Big × ₹160 (₹160)');
    expect(rows[4].amount).toBe(245);

    // Hamali Charges row
    expect(rows[5].title).toBe('Hamali Charges');
    expect(rows[5].details).toBe('2 bags × ₹25.00 / bag');
    expect(rows[5].amount).toBe(50);

    // Storage rent rows sum
    const storageSum = rows.filter((r) => r.id !== 'hamali-charges').reduce((sum, r) => sum + r.amount, 0);
    expect(storageSum).toBe(1015);

    // Grand total sum
    const grandTotal = rows.reduce((sum, r) => sum + r.amount, 0);
    expect(grandTotal).toBe(1065);
  });
});

