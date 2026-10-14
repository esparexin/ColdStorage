import { describe, expect, it } from 'vitest';
import {
  allocateHybridSplit,
  createDeliverySchema,
  createGrnSchema,
  resolveOutwardRates,
} from '../index.js';

describe('Phase 1 S/B Pricing Inward Validation & Outward Delivery Contracts (Option A)', () => {
  describe('1. Inward GRN Validation Contract (createGrnSchema)', () => {
    const basePayload = {
      grnNumber: '1001',
      date: new Date(),
      customerId: 'cust-1',
      commodityId: 'cmd-1',
      chamber: 'Chamber 1',
      bags: 100,
      rentType: 'Seasonal' as const,
    };

    it('accepts total-only S/B inward with differential rates (verification deferred to outward)', () => {
      const result = createGrnSchema.safeParse({
        ...basePayload,
        bagType: 'S/B',
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(result.success).toBe(true);
    });

    it('accepts S/B when differential rates are submitted with verified bag counts', () => {
      const result = createGrnSchema.safeParse({
        ...basePayload,
        bagType: 'S/B',
        smallBags: 60,
        bigBags: 40,
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(result.success).toBe(true);
    });

    it('accepts S/B when equal rates are submitted without verified bag counts', () => {
      const result = createGrnSchema.safeParse({
        ...basePayload,
        bagType: 'S/B',
        smallBagPrice: 10,
        bigBagPrice: 10,
      });
      expect(result.success).toBe(true);
    });

    it('accepts single-type S and B without requiring opposite counts', () => {
      const resultS = createGrnSchema.safeParse({
        ...basePayload,
        bagType: 'S',
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(resultS.success).toBe(true);

      const resultB = createGrnSchema.safeParse({
        ...basePayload,
        bagType: 'B',
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(resultB.success).toBe(true);
    });

    it('rejects composition when small + big does not equal declared total', () => {
      const result = createGrnSchema.safeParse({
        ...basePayload,
        bagType: 'S+B',
        smallBags: 60,
        bigBags: 30, // 90 !== 100
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('2. Outward Delivery & Hybrid Reconciliation Contracts', () => {
    it('resolves canonical outward rates with GRN rate overrides', () => {
      const canonical = resolveOutwardRates('Seasonal');
      expect(canonical).toEqual({ small: 10, big: 15 });

      const overridden = resolveOutwardRates('Seasonal', { smallBagPrice: 12, bigBagPrice: 18 });
      expect(overridden).toEqual({ small: 12, big: 18 });

      const flatOverride = resolveOutwardRates('Seasonal', { bagPrice: 14 });
      expect(flatOverride).toEqual({ small: 14, big: 14 });
    });

    it('validates createDeliverySchema requires at least one bag', () => {
      const invalid = createDeliverySchema.safeParse({
        grnId: 'grn-1',
        smallBags: 0,
        bigBags: 0,
      });
      expect(invalid.success).toBe(false);

      const validQuantity = createDeliverySchema.safeParse({
        grnId: 'grn-1',
        quantity: 50,
      });
      expect(validQuantity.success).toBe(true);

      const validComposition = createDeliverySchema.safeParse({
        grnId: 'grn-1',
        smallBags: 30,
        bigBags: 20,
      });
      expect(validComposition.success).toBe(true);
    });

    it('safely allocates Hybrid split without exceeding remaining stock', () => {
      // 100 small and 50 big available; request 80 bags -> draws 80 small, 0 big
      const alloc1 = allocateHybridSplit(100, 50, 80);
      expect(alloc1).toEqual({ smallBags: 80, bigBags: 0 });

      // Request 120 bags -> draws 100 small (all), 20 big
      const alloc2 = allocateHybridSplit(100, 50, 120);
      expect(alloc2).toEqual({ smallBags: 100, bigBags: 20 });
    });
  });
});
