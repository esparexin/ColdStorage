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
      expect(VALID_DELIVERY_STATUS_TABS['UNSETTLED']).toBe('UNSETTLED');
      expect(VALID_DELIVERY_STATUS_TABS['CLOSED']).toBe('UNSETTLED');
      expect(VALID_DELIVERY_STATUS_TABS['PARTIAL']).toBe('PARTIAL');
      expect(VALID_DELIVERY_STATUS_TABS['PARTIALLY_PAID']).toBe('PARTIAL');
    });
  });

  describe('resolveInitialDeliveryStatusTab', () => {
    it('defaults to ACTIVE when search and storage are empty', () => {
      expect(resolveInitialDeliveryStatusTab('', null)).toBe('ACTIVE');
    });

    it('resolves active tab from URL search param ?tab=', () => {
      expect(resolveInitialDeliveryStatusTab('?tab=unsettled', null)).toBe('UNSETTLED');
      expect(resolveInitialDeliveryStatusTab('?tab=UNSETTLED', null)).toBe('UNSETTLED');
      expect(resolveInitialDeliveryStatusTab('?tab=closed', null)).toBe('UNSETTLED');
      expect(resolveInitialDeliveryStatusTab('?tab=partial', null)).toBe('PARTIAL');
      expect(resolveInitialDeliveryStatusTab('?tab=PARTIAL', null)).toBe('PARTIAL');
      expect(resolveInitialDeliveryStatusTab('?tab=all', null)).toBe('');
      expect(resolveInitialDeliveryStatusTab('?tab=active', null)).toBe('ACTIVE');
    });

    it('resolves active tab from fallback URL search param ?status=', () => {
      expect(resolveInitialDeliveryStatusTab('?status=UNSETTLED', null)).toBe('UNSETTLED');
      expect(resolveInitialDeliveryStatusTab('?status=CLOSED', null)).toBe('UNSETTLED');
      expect(resolveInitialDeliveryStatusTab('?status=partial', null)).toBe('PARTIAL');
      expect(resolveInitialDeliveryStatusTab('?status=issued', null)).toBe('ACTIVE');
      expect(resolveInitialDeliveryStatusTab('?status=all', null)).toBe('');
    });

    it('falls back to storedTab if URL search param is not set', () => {
      expect(resolveInitialDeliveryStatusTab('', 'UNSETTLED')).toBe('UNSETTLED');
      expect(resolveInitialDeliveryStatusTab('', 'CLOSED')).toBe('UNSETTLED');
      expect(resolveInitialDeliveryStatusTab('', 'PARTIAL')).toBe('PARTIAL');
      expect(resolveInitialDeliveryStatusTab('', 'ACTIVE')).toBe('ACTIVE');
      expect(resolveInitialDeliveryStatusTab('', 'ALL')).toBe('');
      expect(resolveInitialDeliveryStatusTab('?search=test', 'UNSETTLED')).toBe('UNSETTLED');
    });

    it('prioritizes explicit URL search param over storedTab', () => {
      expect(resolveInitialDeliveryStatusTab('?tab=unsettled', 'ACTIVE')).toBe('UNSETTLED');
      expect(resolveInitialDeliveryStatusTab('?tab=partial', 'UNSETTLED')).toBe('PARTIAL');
      expect(resolveInitialDeliveryStatusTab('?tab=all', 'UNSETTLED')).toBe('');
    });

    it('ignores invalid tab values and falls back to ACTIVE', () => {
      expect(resolveInitialDeliveryStatusTab('?tab=INVALID', null)).toBe('ACTIVE');
      expect(resolveInitialDeliveryStatusTab('', 'UNKNOWN')).toBe('ACTIVE');
    });
  });

  describe('syncDeliveryStatusTabToLocation', () => {
    it('syncs tab without throwing error', () => {
      expect(() => syncDeliveryStatusTabToLocation('UNSETTLED')).not.toThrow();
      expect(() => syncDeliveryStatusTabToLocation('PARTIAL')).not.toThrow();
      expect(() => syncDeliveryStatusTabToLocation('ACTIVE')).not.toThrow();
      expect(() => syncDeliveryStatusTabToLocation('')).not.toThrow();
    });
  });
});
