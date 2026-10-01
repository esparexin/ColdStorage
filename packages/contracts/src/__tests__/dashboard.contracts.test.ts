import { describe, expect, it } from 'vitest';
import {
  chamberUtilizationSchema,
  commodityStockSchema,
  dashboardSummarySchema,
  recentActivityItemSchema,
} from '../dashboard.js';

describe('P7 Dashboard Contracts', () => {
  // ---------------------------------------------------------------------------
  // ChamberUtilization
  // ---------------------------------------------------------------------------
  describe('chamberUtilizationSchema', () => {
    it('accepts a valid active chamber', () => {
      const result = chamberUtilizationSchema.safeParse({
        chamberId: 'ch-1',
        chamberNumber: 'CH-01',
        isActive: true,
        capacityBags: 1000,
        occupiedBags: 400,
        availableBags: 600,
        utilizationRate: 40,
      });
      expect(result.success).toBe(true);
    });

    it('accepts an inactive chamber with stock', () => {
      const result = chamberUtilizationSchema.safeParse({
        chamberId: 'ch-2',
        chamberNumber: 'CH-02',
        isActive: false,
        capacityBags: 500,
        occupiedBags: 100,
        availableBags: 400,
        utilizationRate: 20,
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.isActive).toBe(false);
    });

    it('rejects utilizationRate > 100', () => {
      const result = chamberUtilizationSchema.safeParse({
        chamberId: 'ch-1',
        chamberNumber: 'CH-01',
        isActive: true,
        capacityBags: 100,
        occupiedBags: 110,
        availableBags: 0,
        utilizationRate: 110,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative availableBags', () => {
      const result = chamberUtilizationSchema.safeParse({
        chamberId: 'ch-1',
        chamberNumber: 'CH-01',
        isActive: true,
        capacityBags: 100,
        occupiedBags: 110,
        availableBags: -10,
        utilizationRate: 100,
      });
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // CommodityStock
  // ---------------------------------------------------------------------------
  describe('commodityStockSchema', () => {
    it('accepts valid commodity stock', () => {
      const result = commodityStockSchema.safeParse({
        commodityId: 'cmd-1',
        commodityName: 'Wheat',
        totalBags: 500,
      });
      expect(result.success).toBe(true);
    });

    it('rejects zero totalBags (only positive stock is reported)', () => {
      const result = commodityStockSchema.safeParse({
        commodityId: 'cmd-1',
        commodityName: 'Wheat',
        totalBags: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // RecentActivityItem
  // ---------------------------------------------------------------------------
  describe('recentActivityItemSchema', () => {
    const base = {
      id: 'txn-1',
      type: 'INWARD_PUTAWAY' as const,
      referenceNumber: 'GRN-26-27-001',
      positionCode: 'CH1-R1-L1-P1',
      date: new Date('2026-10-01T10:00:00.000Z'),
      bags: 100,
      summary: 'Put away 100 bags at CH1-R1-L1-P1',
    };

    it('accepts a valid INWARD_PUTAWAY activity', () => {
      const result = recentActivityItemSchema.safeParse(base);
      expect(result.success).toBe(true);
    });

    it('accepts a valid OUTWARD_DELIVERY activity', () => {
      const result = recentActivityItemSchema.safeParse({
        ...base,
        id: 'txn-2',
        type: 'OUTWARD_DELIVERY',
        referenceNumber: 'DC-26-27-001',
        summary: 'Delivered 100 bags via challan DC-26-27-001',
      });
      expect(result.success).toBe(true);
    });

    it('accepts a valid DELIVERY_REVERSAL activity', () => {
      const result = recentActivityItemSchema.safeParse({
        ...base,
        id: 'txn-3',
        type: 'DELIVERY_REVERSAL',
        referenceNumber: 'DC-26-27-001',
        summary: 'Reversed delivery DC-26-27-001 — 100 bags returned',
      });
      expect(result.success).toBe(true);
    });

    it('rejects unknown transaction type', () => {
      const result = recentActivityItemSchema.safeParse({
        ...base,
        type: 'UNKNOWN_TYPE',
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero bags', () => {
      const result = recentActivityItemSchema.safeParse({ ...base, bags: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects negative bags', () => {
      const result = recentActivityItemSchema.safeParse({ ...base, bags: -10 });
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // DashboardSummary
  // ---------------------------------------------------------------------------
  describe('dashboardSummarySchema', () => {
    const validSummary = {
      facilityId: 'fac-1',
      totalCapacityBags: 2000,
      occupiedBags: 800,
      availableBags: 1200,
      utilizationRate: 40,
      activeGrns: 3,
      closedGrns: 5,
      monthlyInwardBags: 200,
      monthlyDeliveredBags: 50,
      chamberUtilization: [
        {
          chamberId: 'ch-1',
          chamberNumber: 'CH-01',
          isActive: true,
          capacityBags: 2000,
          occupiedBags: 800,
          availableBags: 1200,
          utilizationRate: 40,
        },
      ],
      commodityBreakdown: [
        { commodityId: 'cmd-1', commodityName: 'Wheat', totalBags: 800 },
      ],
      recentActivity: [
        {
          id: 'txn-1',
          type: 'INWARD_PUTAWAY' as const,
          referenceNumber: 'GRN-26-27-001',
          positionCode: 'CH1-R1-L1-P1',
          date: new Date('2026-10-01T10:00:00.000Z'),
          bags: 200,
          summary: 'Put away 200 bags at CH1-R1-L1-P1',
        },
      ],
      generatedAt: new Date(),
    };

    it('accepts a valid dashboard summary', () => {
      const result = dashboardSummarySchema.safeParse(validSummary);
      expect(result.success).toBe(true);
    });

    it('rejects negative activeGrns', () => {
      const result = dashboardSummarySchema.safeParse({ ...validSummary, activeGrns: -1 });
      expect(result.success).toBe(false);
    });

    it('rejects utilizationRate > 100', () => {
      const result = dashboardSummarySchema.safeParse({ ...validSummary, utilizationRate: 101 });
      expect(result.success).toBe(false);
    });

    it('allows zero capacity facility (utilizationRate = 0)', () => {
      const result = dashboardSummarySchema.safeParse({
        ...validSummary,
        totalCapacityBags: 0,
        occupiedBags: 0,
        availableBags: 0,
        utilizationRate: 0,
        chamberUtilization: [],
        commodityBreakdown: [],
        recentActivity: [],
      });
      expect(result.success).toBe(true);
    });
  });
});
