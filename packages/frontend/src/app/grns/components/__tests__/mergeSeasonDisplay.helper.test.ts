import { describe, expect, it } from 'vitest';
import {
  formatGrnSeasonLabel,
  resolveSourceSeasonBadge,
} from '../mergeSeasonDisplay.helper';

describe('mergeSeasonDisplay.helper', () => {
  describe('formatGrnSeasonLabel', () => {
    it('returns fallback for null, undefined, or invalid dates', () => {
      expect(formatGrnSeasonLabel(null)).toBe('Season —');
      expect(formatGrnSeasonLabel(undefined)).toBe('Season —');
      expect(formatGrnSeasonLabel('invalid-date')).toBe('Season —');
    });

    it('formats regular March-December inwards with calendar season', () => {
      expect(formatGrnSeasonLabel('2026-03-01')).toBe('Season 2026');
      expect(formatGrnSeasonLabel('2026-07-15')).toBe('Season 2026');
      expect(formatGrnSeasonLabel('2026-12-31')).toBe('Season 2026');
    });

    it('formats January and February inwards as pre-season Monthly', () => {
      expect(formatGrnSeasonLabel('2026-01-02')).toBe('Season 2026 (Jan–Feb Monthly)');
      expect(formatGrnSeasonLabel('2026-02-15')).toBe('Season 2026 (Jan–Feb Monthly)');
    });
  });

  describe('resolveSourceSeasonBadge', () => {
    it('returns null for null, undefined, or invalid dates', () => {
      expect(resolveSourceSeasonBadge(null, 2026)).toBeNull();
      expect(resolveSourceSeasonBadge(undefined, 2026)).toBeNull();
      expect(resolveSourceSeasonBadge('invalid', 2026)).toBeNull();
    });

    it('returns neutral Jan-Feb Monthly badge for Jan/Feb lot in same target year', () => {
      const badge = resolveSourceSeasonBadge('2026-01-02', 2026);
      expect(badge).toEqual({
        label: 'Jan–Feb 2026 (Monthly)',
        variant: 'neutral',
      });
    });

    it('returns warning Prev year badge for previous season regular lots', () => {
      const badge = resolveSourceSeasonBadge('2024-04-05', 2026);
      expect(badge).toEqual({
        label: 'Prev 2024',
        variant: 'warning',
      });
    });

    it('returns warning Prev year (Jan-Feb) for previous season Jan/Feb lots', () => {
      const badge = resolveSourceSeasonBadge('2024-01-02', 2026);
      expect(badge).toEqual({
        label: 'Prev 2024 (Jan–Feb)',
        variant: 'warning',
      });
    });

    it('returns null for same season regular inward', () => {
      expect(resolveSourceSeasonBadge('2026-05-10', 2026)).toBeNull();
    });
  });
});
