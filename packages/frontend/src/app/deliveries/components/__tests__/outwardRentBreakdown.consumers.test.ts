import { describe, expect, it } from 'vitest';
import {
  calculateOutwardSeasonalBreakdown,
  resolveDiscriminatedOutwardRates,
  type DiscriminatedOutwardPricing,
} from '@cold-storage/contracts';
import { formatSeasonalBreakdownRows } from '../outwardRentBreakdown.helper';

describe('Outward Rent Breakdown - Consumers & Single Calculation Projection', () => {
  const auditInwardDate = '2024-04-12';
  const auditDeliveryDate = '2026-10-31';

  describe('Consumer 1: DeliveryBagCompositionFields (Outward Delivery Modal)', () => {
    it('audit scenario: strictly preserves differential S/B rates and reconciles rows to ₹10,220 storage rent and ₹10,670 total payable', () => {
      const isHybrid = false;
      const smallBags = 10;
      const bigBags = 8;
      const seasonalRates = { small: 110, big: 185 };
      const monthlyRates = { small: 30, big: 40 };

      // Discriminated pricing contract rejects polluted hybrid rates on S/B lots
      const pricing: DiscriminatedOutwardPricing = isHybrid
        ? {
            isHybrid: true,
            totalBags: smallBags + bigBags,
            seasonalBagPrice: 110,
            monthlyBagPrice: 30,
          }
        : {
            isHybrid: false,
            seasonalRates,
            monthlyRates,
            smallBags,
            bigBags,
          };

      const resolved = resolveDiscriminatedOutwardRates(pricing);
      expect(resolved.isHybrid).toBe(false);
      expect(resolved.effectiveSeasonalRates).toEqual({ small: 110, big: 185 });
      expect(resolved.effectiveMonthlyRates).toEqual({ small: 30, big: 40 });
      expect(resolved.smallBags).toBe(10);
      expect(resolved.bigBags).toBe(8);

      // Single calculation SSOT breakdown
      const breakdown = calculateOutwardSeasonalBreakdown({
        inwardDate: auditInwardDate,
        deliveryDate: auditDeliveryDate,
        smallBags: resolved.smallBags,
        bigBags: resolved.bigBags,
        seasonalRates: resolved.effectiveSeasonalRates,
        monthlyRates: resolved.effectiveMonthlyRates,
      });

      // Assert seasonal periods and monthly extensions
      const seasonPeriods = breakdown.periods.filter((p) => p.periodType === 'SEASON');
      const extensionPeriods = breakdown.periods.filter((p) => p.periodType !== 'SEASON');

      const seasonalRent = seasonPeriods.reduce((sum, p) => sum + p.amount, 0);
      const extensionRent = extensionPeriods.reduce((sum, p) => sum + p.amount, 0);

      expect(seasonalRent).toBe(7740); // 3 seasons × 2,580
      expect(extensionRent).toBe(2480); // 4 months × 620
      expect(breakdown.totalRent).toBe(10220); // 7,740 + 2,480

      // Formatted display rows
      const rows = formatSeasonalBreakdownRows({
        periods: breakdown.periods,
        isHybrid: false,
        totalWithdrawing: 18,
        hamaliRate: 25,
      });

      // Sum of storage rent rows must match breakdown.totalRent exactly
      const storageRentRowsSum = rows.filter((r) => r.id !== 'hamali-charges').reduce((sum, r) => sum + r.amount, 0);
      expect(storageRentRowsSum).toBe(breakdown.totalRent);
      expect(storageRentRowsSum).toBe(10220);

      // Total payable must equal storage rent + Hamali (450)
      const totalPayableRowsSum = rows.reduce((sum, r) => sum + r.amount, 0);
      expect(totalPayableRowsSum).toBe(10670);
    });

    it('hybrid outward delivery: correctly applies uniform single-rate pricing across all bags', () => {
      const isHybrid = true;
      const totalBags = 20;

      const pricing: DiscriminatedOutwardPricing = {
        isHybrid,
        totalBags,
        seasonalBagPrice: 150,
        monthlyBagPrice: 35,
      };

      const resolved = resolveDiscriminatedOutwardRates(pricing);
      expect(resolved.isHybrid).toBe(true);
      expect(resolved.effectiveSeasonalRates).toEqual({ small: 150, big: 150 });
      expect(resolved.effectiveMonthlyRates).toEqual({ small: 35, big: 35 });
      expect(resolved.smallBags).toBe(20);
      expect(resolved.bigBags).toBe(0);

      const breakdown = calculateOutwardSeasonalBreakdown({
        inwardDate: auditInwardDate,
        deliveryDate: auditDeliveryDate,
        smallBags: resolved.smallBags,
        bigBags: resolved.bigBags,
        seasonalRates: resolved.effectiveSeasonalRates,
        monthlyRates: resolved.effectiveMonthlyRates,
      });

      // 3 seasons @ (20 * 150 = 3000) = 9000
      // 4 extension months @ (20 * 35 = 700) = 2800
      // Total = 11800
      expect(breakdown.totalRent).toBe(11800);

      const rows = formatSeasonalBreakdownRows({
        periods: breakdown.periods,
        isHybrid: true,
        totalWithdrawing: 20,
        hamaliRate: 20,
      });

      const storageRowsSum = rows.filter((r) => r.id !== 'hamali-charges').reduce((sum, r) => sum + r.amount, 0);
      expect(storageRowsSum).toBe(breakdown.totalRent);
      expect(storageRowsSum).toBe(11800);

      const totalRowsSum = rows.reduce((sum, r) => sum + r.amount, 0);
      expect(totalRowsSum).toBe(11800 + 20 * 20); // 11800 + 400 = 12200
    });
  });

  describe('Consumer 2: MergeStep3Settlement (Internal Merge)', () => {
    it('shields S/B source GRN from stray hybrid pricing inputs during merge assessment', () => {
      const isHybrid = false;
      const smallBags = 15;
      const bigBags = 10;
      const seasonalRates = { small: 120, big: 200 };
      const monthlyRates = { small: 25, big: 35 };

      // Stray seasonalBagPrice/monthlyBagPrice from wizard state must not enter S/B pricing
      const pricing: DiscriminatedOutwardPricing = isHybrid
        ? {
            isHybrid: true,
            totalBags: 25,
            seasonalBagPrice: 999, // stray
          }
        : {
            isHybrid: false,
            seasonalRates,
            monthlyRates,
            smallBags,
            bigBags,
          };

      const resolved = resolveDiscriminatedOutwardRates(pricing);
      expect(resolved.effectiveSeasonalRates).toEqual({ small: 120, big: 200 });
      expect(resolved.smallBags).toBe(15);
      expect(resolved.bigBags).toBe(10);

      const breakdown = calculateOutwardSeasonalBreakdown({
        inwardDate: '2025-05-10',
        deliveryDate: '2026-10-15',
        smallBags: resolved.smallBags,
        bigBags: resolved.bigBags,
        seasonalRates: resolved.effectiveSeasonalRates,
        monthlyRates: resolved.effectiveMonthlyRates,
      });

      // 2025-05-10 to 2026-10-15 has:
      // Season 2025: 15*120 + 10*200 = 1800 + 2000 = 3800
      // Jan 2026: 15*25 + 10*35 = 375 + 350 = 725
      // Feb 2026: 15*25 + 10*35 = 375 + 350 = 725
      // Season 2026: 15*120 + 10*200 = 3800
      // Total = 3800 + 725 + 725 + 3800 = 9050
      expect(breakdown.totalRent).toBe(9050);

      const rows = formatSeasonalBreakdownRows({
        periods: breakdown.periods,
        isHybrid: false,
        totalWithdrawing: 25,
      });
      const rowsSum = rows.reduce((sum, r) => sum + r.amount, 0);
      expect(rowsSum).toBe(breakdown.totalRent);
    });
  });

  describe('Consumer 3: TransferRentAssessment (Ownership Transfer)', () => {
    it('shields S/B transfer lot from stray hybrid prices and enforces row equality', () => {
      const isHybrid = false;
      const smallBags = 8;
      const bigBags = 12;
      const seasonalRates = { small: 100, big: 160 };
      const monthlyRates = { small: 20, big: 30 };

      const pricing: DiscriminatedOutwardPricing = isHybrid
        ? {
            isHybrid: true,
            totalBags: 20,
            seasonalBagPrice: 50,
          }
        : {
            isHybrid: false,
            seasonalRates,
            monthlyRates,
            smallBags,
            bigBags,
          };

      const resolved = resolveDiscriminatedOutwardRates(pricing);
      expect(resolved.effectiveSeasonalRates).toEqual({ small: 100, big: 160 });

      const breakdown = calculateOutwardSeasonalBreakdown({
        inwardDate: '2024-04-12',
        deliveryDate: '2026-10-31',
        smallBags: resolved.smallBags,
        bigBags: resolved.bigBags,
        seasonalRates: resolved.effectiveSeasonalRates,
        monthlyRates: resolved.effectiveMonthlyRates,
      });

      // 3 seasons @ (8*100 + 12*160 = 800 + 1920 = 2720) = 8160
      // 4 extension months @ (8*20 + 12*30 = 160 + 360 = 520) = 2080
      // Total = 8160 + 2080 = 10240
      expect(breakdown.totalRent).toBe(10240);

      const rows = formatSeasonalBreakdownRows({
        periods: breakdown.periods,
        isHybrid: false,
        totalWithdrawing: 20,
        hamaliRate: 15,
      });

      const storageRowsSum = rows.filter((r) => r.id !== 'hamali-charges').reduce((sum, r) => sum + r.amount, 0);
      expect(storageRowsSum).toBe(breakdown.totalRent);
      expect(storageRowsSum).toBe(10240);

      const totalRowsSum = rows.reduce((sum, r) => sum + r.amount, 0);
      expect(totalRowsSum).toBe(10240 + 20 * 15); // 10240 + 300 = 10540
    });
  });
});
