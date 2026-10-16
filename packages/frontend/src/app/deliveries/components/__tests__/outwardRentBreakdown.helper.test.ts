import { describe, expect, it } from 'vitest';
import {
  appendHamaliRowIfNeeded,
  formatSeasonalBreakdownRows,
  getPeriodMeta,
} from '../outwardRentBreakdown.helper';

describe('outwardRentBreakdown.helper', () => {
  describe('getPeriodMeta', () => {
    it('returns monthly extension meta for JANUARY', () => {
      expect(getPeriodMeta('JANUARY')).toEqual({
        type: 'Monthly Extension',
        range: 'Jan 1 – Jan 31',
      });
    });

    it('returns monthly extension meta for FEBRUARY', () => {
      expect(getPeriodMeta('FEBRUARY')).toEqual({
        type: 'Monthly Extension',
        range: 'Feb 1 – Feb 28',
      });
    });

    it('returns seasonal storage meta for default/SEASON', () => {
      expect(getPeriodMeta('SEASON')).toEqual({
        type: 'Seasonal Storage',
        range: 'Mar 1 – Dec 31',
      });
    });
  });

  describe('appendHamaliRowIfNeeded', () => {
    it('does not append hamali if rate is zero or undefined', () => {
      const initial = [{ id: '1', title: 'Season', periodMeta: '', details: '', amount: 100 }];
      expect(appendHamaliRowIfNeeded(initial, 10, 0)).toEqual(initial);
      expect(appendHamaliRowIfNeeded(initial, 10, undefined)).toEqual(initial);
      expect(appendHamaliRowIfNeeded(initial, 0, 5)).toEqual(initial);
    });

    it('appends hamali row when rate and bags are positive', () => {
      const initial = [{ id: '1', title: 'Season', periodMeta: '', details: '', amount: 100 }];
      const result = appendHamaliRowIfNeeded(initial, 100, 5);
      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({
        id: 'hamali-charges',
        title: 'Hamali Charges',
        periodMeta: '',
        details: '100 bags × ₹5.00 / bag',
        amount: 500,
      });
    });
  });

  describe('formatSeasonalBreakdownRows', () => {
    it('formats a single seasonal period with year prefix', () => {
      const rows = formatSeasonalBreakdownRows({
        periods: [
          {
            periodKey: 'season-2024',
            label: 'Season 2024',
            periodType: 'SEASON',
            smallBags: 20,
            bigBags: 30,
            smallRate: 8,
            bigRate: 10,
            amount: 460,
          },
        ],
        isHybrid: false,
        totalWithdrawing: 50,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('(2024) Mar - Dec');
      expect(rows[0].periodMeta).toBe('');
      expect(rows[0].details).toContain('20 Small × ₹8');
      expect(rows[0].details).toContain('30 Big × ₹10');
      expect(rows[0].amount).toBe(460);
    });

    it('combines consecutive January and February into Jan - Feb', () => {
      const rows = formatSeasonalBreakdownRows({
        periods: [
          {
            periodKey: 'season-2024',
            label: 'Season 2024',
            periodType: 'SEASON',
            smallBags: 10,
            bigBags: 0,
            smallRate: 8,
            bigRate: 10,
            amount: 80,
          },
          {
            periodKey: 'jan-2025',
            label: 'January 2025',
            periodType: 'JANUARY',
            smallBags: 10,
            bigBags: 0,
            smallRate: 2,
            bigRate: 3,
            amount: 20,
          },
          {
            periodKey: 'feb-2025',
            label: 'February 2025',
            periodType: 'FEBRUARY',
            smallBags: 10,
            bigBags: 0,
            smallRate: 2,
            bigRate: 3,
            amount: 20,
          },
        ],
        isHybrid: false,
        totalWithdrawing: 10,
        hamaliRate: 4,
      });

      // Season + Combined Jan-Feb + Hamali = 3 rows
      expect(rows).toHaveLength(3);
      expect(rows[0].title).toBe('(2024) Mar - Dec');
      expect(rows[1].title).toBe('Jan - Feb');
      expect(rows[1].periodMeta).toBe('');
      expect(rows[1].amount).toBe(40);
      expect(rows[1].details).toContain('(2 months)');
      expect(rows[2].title).toBe('Hamali Charges');
      expect(rows[2].amount).toBe(40);
    });

    it('handles standalone January without February correctly', () => {
      const rows = formatSeasonalBreakdownRows({
        periods: [
          {
            periodKey: 'jan-2025',
            label: 'January 2025',
            periodType: 'JANUARY',
            smallBags: 10,
            bigBags: 0,
            smallRate: 2,
            bigRate: 3,
            amount: 20,
          },
        ],
        isHybrid: true,
        totalWithdrawing: 10,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Jan 2025');
      expect(rows[0].periodMeta).toBe('');
      expect(rows[0].amount).toBe(20);
    });

    it('handles hybrid pricing representation', () => {
      const rows = formatSeasonalBreakdownRows({
        periods: [
          {
            periodKey: 'season-2025',
            label: 'Season 2025',
            periodType: 'SEASON',
            smallBags: 0,
            bigBags: 0,
            smallRate: 12,
            bigRate: 12,
            amount: 600,
          },
        ],
        isHybrid: true,
        totalWithdrawing: 50,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].details).toBe('50 Bags × ₹12 (₹600)');
    });

    it('accurately produces multi-season rows matching delivery challan without extraneous balance items', () => {
      const rows = formatSeasonalBreakdownRows({
        periods: [
          { periodKey: 's-2024', label: 'Season 2024', periodType: 'SEASON', smallBags: 6, bigBags: 4, smallRate: 150, bigRate: 210, amount: 1740 },
          { periodKey: 'jan-2025', label: 'January 2025', periodType: 'JANUARY', smallBags: 6, bigBags: 4, smallRate: 24, bigRate: 60, amount: 192 },
          { periodKey: 'feb-2025', label: 'February 2025', periodType: 'FEBRUARY', smallBags: 6, bigBags: 4, smallRate: 24, bigRate: 60, amount: 192 },
          { periodKey: 's-2025', label: 'Season 2025', periodType: 'SEASON', smallBags: 6, bigBags: 4, smallRate: 150, bigRate: 210, amount: 1740 },
          { periodKey: 'jan-2026', label: 'January 2026', periodType: 'JANUARY', smallBags: 6, bigBags: 4, smallRate: 24, bigRate: 60, amount: 192 },
          { periodKey: 'feb-2026', label: 'February 2026', periodType: 'FEBRUARY', smallBags: 6, bigBags: 4, smallRate: 24, bigRate: 60, amount: 192 },
          { periodKey: 's-2026', label: 'Season 2026', periodType: 'SEASON', smallBags: 6, bigBags: 4, smallRate: 150, bigRate: 210, amount: 1740 },
        ],
        isHybrid: false,
        totalWithdrawing: 10,
        hamaliRate: 20,
      });

      expect(rows).toHaveLength(6);
      expect(rows.map((r) => r.title)).toEqual([
        '(2024) Mar - Dec',
        'Jan - Feb',
        '(2025) Mar - Dec',
        'Jan - Feb',
        '(2026) Mar - Dec',
        'Hamali Charges',
      ]);
      const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
      expect(totalAmount).toBe(6188);
      expect(rows.some((r) => r.title.toLowerCase().includes('pending'))).toBe(false);
      expect(rows.some((r) => r.title.toLowerCase().includes('unsettled'))).toBe(false);
    });
  });
});
