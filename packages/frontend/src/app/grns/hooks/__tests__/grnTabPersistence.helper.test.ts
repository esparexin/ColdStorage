import { describe, expect, it } from 'vitest';
import { resolveInitialGrnTab, VALID_GRN_TABS } from '../grnTabPersistence.helper';

describe('GRN Active Tab Persistence Helpers', () => {
  describe('VALID_GRN_TABS', () => {
    it('defines expected valid tab mappings', () => {
      expect(VALID_GRN_TABS['']).toBe('');
      expect(VALID_GRN_TABS['ALL']).toBe('');
      expect(VALID_GRN_TABS['OPEN']).toBe('OPEN');
      expect(VALID_GRN_TABS['CLOSED']).toBe('CLOSED');
      expect(VALID_GRN_TABS['MERGED']).toBe('MERGED');
    });
  });

  describe('resolveInitialGrnTab', () => {
    it('defaults to empty string (All) when no URL param or storage is provided', () => {
      expect(resolveInitialGrnTab('', null)).toBe('');
      expect(resolveInitialGrnTab('?', null)).toBe('');
    });

    it('resolves active tab from URL search param ?tab=', () => {
      expect(resolveInitialGrnTab('?tab=open', null)).toBe('OPEN');
      expect(resolveInitialGrnTab('?tab=CLOSED', null)).toBe('CLOSED');
      expect(resolveInitialGrnTab('?tab=merged', null)).toBe('MERGED');
      expect(resolveInitialGrnTab('?tab=all', null)).toBe('');
    });

    it('resolves active tab from fallback URL search param ?status=', () => {
      expect(resolveInitialGrnTab('?status=OPEN', null)).toBe('OPEN');
      expect(resolveInitialGrnTab('?status=closed', null)).toBe('CLOSED');
      expect(resolveInitialGrnTab('?status=MERGED', null)).toBe('MERGED');
    });

    it('falls back to sessionStorage if URL search param is not set', () => {
      expect(resolveInitialGrnTab('', 'OPEN')).toBe('OPEN');
      expect(resolveInitialGrnTab('', 'CLOSED')).toBe('CLOSED');
      expect(resolveInitialGrnTab('', 'MERGED')).toBe('MERGED');
      expect(resolveInitialGrnTab('?search=test', 'OPEN')).toBe('OPEN');
    });

    it('prioritizes explicit URL search param over sessionStorage value', () => {
      expect(resolveInitialGrnTab('?tab=closed', 'OPEN')).toBe('CLOSED');
      expect(resolveInitialGrnTab('?tab=merged', 'CLOSED')).toBe('MERGED');
    });

    it('ignores invalid or unknown tab values and falls back safely to empty string', () => {
      expect(resolveInitialGrnTab('?tab=INVALID', null)).toBe('');
      expect(resolveInitialGrnTab('', 'UNKNOWN')).toBe('');
    });
  });
});
