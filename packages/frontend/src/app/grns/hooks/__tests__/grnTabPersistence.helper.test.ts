import { describe, expect, it } from 'vitest';
import { resolveInitialGrnTab, VALID_GRN_TABS } from '../grnTabPersistence.helper';

describe('GRN Profile Tab Persistence Helpers', () => {
  describe('VALID_GRN_TABS', () => {
    it('defines expected valid tab mappings', () => {
      expect(VALID_GRN_TABS['']).toBe('');
      expect(VALID_GRN_TABS['ALL']).toBe('');
      expect(VALID_GRN_TABS['ACTIVE']).toBe('ACTIVE');
      expect(VALID_GRN_TABS['PARTIAL']).toBe('PARTIAL');
      expect(VALID_GRN_TABS['PENDING_PAYMENT']).toBe('PENDING_PAYMENT');
      expect(VALID_GRN_TABS['CLOSED']).toBe('CLOSED');
      expect(VALID_GRN_TABS['MERGED']).toBe('MERGED');
      expect(VALID_GRN_TABS['OPEN']).toBe('ACTIVE');
    });
  });

  describe('resolveInitialGrnTab', () => {
    it('defaults to empty string (All) when no URL param or storage is provided', () => {
      expect(resolveInitialGrnTab('', null)).toBe('');
      expect(resolveInitialGrnTab('?', null)).toBe('');
    });

    it('resolves active tab from URL search param ?tab=', () => {
      expect(resolveInitialGrnTab('?tab=active', null)).toBe('ACTIVE');
      expect(resolveInitialGrnTab('?tab=partial', null)).toBe('PARTIAL');
      expect(resolveInitialGrnTab('?tab=pending_payment', null)).toBe('PENDING_PAYMENT');
      expect(resolveInitialGrnTab('?tab=CLOSED', null)).toBe('CLOSED');
      expect(resolveInitialGrnTab('?tab=merged', null)).toBe('MERGED');
      expect(resolveInitialGrnTab('?tab=all', null)).toBe('');
      expect(resolveInitialGrnTab('?tab=open', null)).toBe('ACTIVE');
    });

    it('resolves active tab from fallback URL search param ?status=', () => {
      expect(resolveInitialGrnTab('?status=ACTIVE', null)).toBe('ACTIVE');
      expect(resolveInitialGrnTab('?status=partial', null)).toBe('PARTIAL');
      expect(resolveInitialGrnTab('?status=closed', null)).toBe('CLOSED');
      expect(resolveInitialGrnTab('?status=MERGED', null)).toBe('MERGED');
    });

    it('falls back to sessionStorage if URL search param is not set', () => {
      expect(resolveInitialGrnTab('', 'ACTIVE')).toBe('ACTIVE');
      expect(resolveInitialGrnTab('', 'PARTIAL')).toBe('PARTIAL');
      expect(resolveInitialGrnTab('', 'CLOSED')).toBe('CLOSED');
      expect(resolveInitialGrnTab('', 'MERGED')).toBe('MERGED');
    });

    it('prioritizes explicit URL search param over sessionStorage value', () => {
      expect(resolveInitialGrnTab('?tab=closed', 'ACTIVE')).toBe('CLOSED');
      expect(resolveInitialGrnTab('?tab=merged', 'CLOSED')).toBe('MERGED');
    });

    it('ignores invalid or unknown tab values and falls back safely to empty string', () => {
      expect(resolveInitialGrnTab('?tab=INVALID', null)).toBe('');
      expect(resolveInitialGrnTab('', 'UNKNOWN')).toBe('');
    });
  });
});
