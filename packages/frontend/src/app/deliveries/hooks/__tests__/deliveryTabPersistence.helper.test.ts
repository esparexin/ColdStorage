import { describe, expect, it } from 'vitest';
import {
  resolveInitialDeliveryStatusTab,
  syncDeliveryStatusTabToLocation,
  VALID_DELIVERY_STATUS_TABS,
} from '../deliveryTabPersistence.helper';

describe('deliveryTabPersistence.helper', () => {
  describe('VALID_DELIVERY_STATUS_TABS', () => {
    it('defines expected valid tab mappings', () => {
      expect(VALID_DELIVERY_STATUS_TABS['']).toBe('');
      expect(VALID_DELIVERY_STATUS_TABS['ALL']).toBe('');
      expect(VALID_DELIVERY_STATUS_TABS['ACTIVE']).toBe('ACTIVE');
      expect(VALID_DELIVERY_STATUS_TABS['ISSUED']).toBe('ACTIVE');
      expect(VALID_DELIVERY_STATUS_TABS['CLOSED']).toBe('CLOSED');
    });
  });

  describe('resolveInitialDeliveryStatusTab', () => {
    it('defaults to ACTIVE when search and storage are empty', () => {
      expect(resolveInitialDeliveryStatusTab('', null)).toBe('ACTIVE');
    });

    it('resolves active tab from URL search param ?tab=', () => {
      expect(resolveInitialDeliveryStatusTab('?tab=closed', null)).toBe('CLOSED');
      expect(resolveInitialDeliveryStatusTab('?tab=CLOSED', null)).toBe('CLOSED');
      expect(resolveInitialDeliveryStatusTab('?tab=all', null)).toBe('');
      expect(resolveInitialDeliveryStatusTab('?tab=active', null)).toBe('ACTIVE');
    });

    it('resolves active tab from fallback URL search param ?status=', () => {
      expect(resolveInitialDeliveryStatusTab('?status=CLOSED', null)).toBe('CLOSED');
      expect(resolveInitialDeliveryStatusTab('?status=issued', null)).toBe('ACTIVE');
      expect(resolveInitialDeliveryStatusTab('?status=all', null)).toBe('');
    });

    it('falls back to storedTab if URL search param is not set', () => {
      expect(resolveInitialDeliveryStatusTab('', 'CLOSED')).toBe('CLOSED');
      expect(resolveInitialDeliveryStatusTab('', 'ACTIVE')).toBe('ACTIVE');
      expect(resolveInitialDeliveryStatusTab('', 'ALL')).toBe('');
      expect(resolveInitialDeliveryStatusTab('?search=test', 'CLOSED')).toBe('CLOSED');
    });

    it('prioritizes explicit URL search param over storedTab', () => {
      expect(resolveInitialDeliveryStatusTab('?tab=closed', 'ACTIVE')).toBe('CLOSED');
      expect(resolveInitialDeliveryStatusTab('?tab=all', 'CLOSED')).toBe('');
    });

    it('ignores invalid tab values and falls back to ACTIVE', () => {
      expect(resolveInitialDeliveryStatusTab('?tab=INVALID', null)).toBe('ACTIVE');
      expect(resolveInitialDeliveryStatusTab('', 'UNKNOWN')).toBe('ACTIVE');
    });
  });

  describe('syncDeliveryStatusTabToLocation', () => {
    it('syncs tab without throwing error', () => {
      expect(() => syncDeliveryStatusTabToLocation('CLOSED')).not.toThrow();
      expect(() => syncDeliveryStatusTabToLocation('ACTIVE')).not.toThrow();
      expect(() => syncDeliveryStatusTabToLocation('')).not.toThrow();
    });
  });
});
