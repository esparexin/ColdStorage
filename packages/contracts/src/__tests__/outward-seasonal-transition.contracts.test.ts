import { describe, expect, it } from 'vitest';
import {
  deriveHybridRateVisibility,
  shouldEvaluateSeasonalBreakdown,
  calculateOutwardSeasonalBreakdown,
} from '../index.js';

describe('Outward Seasonal Transition SSOT Contracts Tests', () => {
  describe('shouldEvaluateSeasonalBreakdown', () => {
    it('always evaluates seasonal breakdown for Seasonal and Seasonal_3M', () => {
      expect(shouldEvaluateSeasonalBreakdown({ rentType: 'Seasonal' })).toBe(true);
      expect(shouldEvaluateSeasonalBreakdown({ rentType: 'Seasonal_3M' })).toBe(true);
    });

    it('Scenario 1: Jan inward to Jan outward under Monthly remains pure monthly (1 month)', () => {
      const result = shouldEvaluateSeasonalBreakdown({
        rentType: 'Monthly',
        inwardDate: '2026-01-10',
        deliveryDate: '2026-01-20',
        hasSeasonalRates: true,
      });
      expect(result).toBe(false);
    });

    it('Scenario 2: Jan inward to Feb outward under Monthly remains pure monthly (2 months combined)', () => {
      const result = shouldEvaluateSeasonalBreakdown({
        rentType: 'Monthly',
        inwardDate: '2026-01-10',
        deliveryDate: '2026-02-20',
        hasSeasonalRates: true,
      });
      expect(result).toBe(false);
    });

    it('Scenario 3: Jan inward to Mar 1 outward under Monthly transitions to seasonal breakdown', () => {
      const result = shouldEvaluateSeasonalBreakdown({
        rentType: 'Monthly',
        inwardDate: '2026-01-10',
        deliveryDate: '2026-03-01',
        hasSeasonalRates: true,
      });
      expect(result).toBe(true);
    });

    it('Scenario 3b: Jan inward to Nov outward (GRN 0005) under Monthly transitions to seasonal breakdown', () => {
      const result = shouldEvaluateSeasonalBreakdown({
        rentType: 'Monthly',
        inwardDate: '2026-01-01',
        deliveryDate: '2026-11-02',
        hasSeasonalRates: true,
      });
      expect(result).toBe(true);
    });

    it('Feb inward to April outward under Monthly transitions to seasonal breakdown', () => {
      const result = shouldEvaluateSeasonalBreakdown({
        rentType: 'Monthly',
        inwardDate: '2026-02-15',
        deliveryDate: '2026-04-10',
        hasSeasonalRates: true,
      });
      expect(result).toBe(true);
    });

    it('Summer inward (June to August) under Monthly does not cross pre-season and remains pure monthly', () => {
      const result = shouldEvaluateSeasonalBreakdown({
        rentType: 'Monthly',
        inwardDate: '2026-06-01',
        deliveryDate: '2026-08-15',
        hasSeasonalRates: true,
      });
      expect(result).toBe(false);
    });

    it('returns false if seasonal rates are explicitly absent', () => {
      const result = shouldEvaluateSeasonalBreakdown({
        rentType: 'Monthly',
        inwardDate: '2026-01-01',
        deliveryDate: '2026-11-02',
        hasSeasonalRates: false,
      });
      expect(result).toBe(false);
    });
  });

  describe('calculateOutwardSeasonalBreakdown on transition', () => {
    it('calculates Jan-Feb monthly + full seasonal total for Jan inward delivered in Nov', () => {
      const breakdown = calculateOutwardSeasonalBreakdown({
        inwardDate: '2026-01-01',
        deliveryDate: '2026-11-02',
        smallBags: 1,
        bigBags: 1,
        seasonalRates: { small: 125, big: 205 },
        monthlyRates: { small: 45, big: 65 },
      });

      expect(breakdown.periods).toHaveLength(3);
      // Period 1: Jan (1 Small * 45 + 1 Big * 65 = 110)
      expect(breakdown.periods[0].periodKey).toBe('JANUARY_2026');
      expect(breakdown.periods[0].amount).toBe(110);

      // Period 2: Feb (1 Small * 45 + 1 Big * 65 = 110)
      expect(breakdown.periods[1].periodKey).toBe('FEBRUARY_2026');
      expect(breakdown.periods[1].amount).toBe(110);

      // Period 3: Season 2026 (1 Small * 125 + 1 Big * 205 = 330)
      expect(breakdown.periods[2].periodKey).toBe('SEASON_2026');
      expect(breakdown.periods[2].amount).toBe(330);

      // Total = 110 + 110 + 330 = 550
      expect(breakdown.totalRent).toBe(550);
    });
  });

  describe('deriveHybridRateVisibility with transition', () => {
    it('shows both seasonal and monthly rates when Monthly GRN crosses into Season', () => {
      const visibility = deriveHybridRateVisibility({
        rentType: 'Monthly',
        inwardDate: '2026-01-01',
        deliveryDate: '2026-11-02',
        hasSeasonalRates: true,
      });
      expect(visibility.showSeasonalRate).toBe(true);
      expect(visibility.showMonthlyRate).toBe(true);
    });

    it('shows only monthly rate when Monthly GRN is delivered in January', () => {
      const visibility = deriveHybridRateVisibility({
        rentType: 'Monthly',
        inwardDate: '2026-01-01',
        deliveryDate: '2026-01-20',
        hasSeasonalRates: true,
      });
      expect(visibility.showSeasonalRate).toBe(false);
      expect(visibility.showMonthlyRate).toBe(true);
    });
  });
});
