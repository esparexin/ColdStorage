import { describe, expect, it } from 'vitest';
import {
  chamberStockSchema,
  commodityStockSchema,
  dashboardSummarySchema,
  recentActivityItemSchema,
} from '../dashboard.js';

describe('P7 Dashboard Contracts', () => {
  // ---------------------------------------------------------------------------
  // ChamberStock — no capacity, occupancy or utilization is reported
  // ---------------------------------------------------------------------------
  describe('chamberStockSchema', () => {
    it('reports stock held under a free-text chamber label', () => {
      const result = chamberStockSchema.safeParse({ chamber: 'CH-01', totalBags: 400 });
      expect(result.success).toBe(true);
    });

    it('rejects a chamber label longer than 20 characters', () => {
      const result = chamberStockSchema.safeParse({ chamber: 'x'.repeat(21), totalBags: 10 });
      expect(result.success).toBe(false);
    });

    it('rejects negative stock', () => {
      const result = chamberStockSchema.safeParse({ chamber: 'A', totalBags: -1 });
      expect(result.success).toBe(false);
    });

    it('rejects capacity-era keys', () => {
      const result = chamberStockSchema.safeParse({
        chamber: 'A',
        totalBags: 10,
        capacityBags: 100,
        utilizationRate: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // CommodityStock
  // ---------------------------------------------------------------------------
  describe('commodityStockSchema', () => {
    it('accepts a commodity holding stock', () => {
      expect(
        commodityStockSchema.safeParse({ commodityId: 'cmd-1', commodityName: 'Wheat', totalBags: 40 })
          .success,
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // RecentActivityItem
  // ---------------------------------------------------------------------------
  describe('recentActivityItemSchema', () => {
    const base = {
      id: 'txn-1',
      referenceNumber: 'GRN-26-27-001',
      chamber: 'A',
      date: new Date('2026-10-01T10:00:00.000Z'),
      bags: 200,
      summary: 'Put away 200 bags in chamber A',
    };

    it('accepts a valid INWARD_PUTAWAY activity', () => {
      expect(
        recentActivityItemSchema.safeParse({ ...base, type: 'INWARD_PUTAWAY' }).success,
      ).toBe(true);
    });

    it('accepts a valid OUTWARD_DELIVERY activity', () => {
      expect(
        recentActivityItemSchema.safeParse({ ...base, type: 'OUTWARD_DELIVERY' }).success,
      ).toBe(true);
    });

    it('accepts a valid DELIVERY_REVERSAL activity', () => {
      expect(
        recentActivityItemSchema.safeParse({ ...base, type: 'DELIVERY_REVERSAL' }).success,
      ).toBe(true);
    });

    it('rejects a position-era payload', () => {
      expect(
        recentActivityItemSchema.safeParse({ ...base, type: 'INWARD_PUTAWAY', positionCode: 'P-1' })
          .success,
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // DashboardSummary
  // ---------------------------------------------------------------------------
  describe('dashboardSummarySchema', () => {
    const validSummary = {
      facilityId: 'fac-1',
      totalStockBags: 800,
      activeGrns: 3,
      closedGrns: 5,
      monthlyInwardBags: 200,
      monthlyDeliveredBags: 50,
      chamberStock: [{ chamber: 'CH-01', totalBags: 800 }],
      commodityBreakdown: [{ commodityId: 'cmd-1', commodityName: 'Wheat', totalBags: 800 }],
      recentActivity: [
        {
          id: 'txn-1',
          type: 'INWARD_PUTAWAY' as const,
          referenceNumber: 'GRN-26-27-001',
          chamber: 'A',
          date: new Date('2026-10-01T10:00:00.000Z'),
          bags: 200,
          summary: 'Put away 200 bags in chamber A',
        },
      ],
      generatedAt: new Date(),
    };

    it('accepts a valid dashboard summary', () => {
      expect(dashboardSummarySchema.safeParse(validSummary).success).toBe(true);
    });

    it('rejects negative activeGrns', () => {
      expect(dashboardSummarySchema.safeParse({ ...validSummary, activeGrns: -1 }).success).toBe(
        false,
      );
    });

    it('allows an empty facility with no stock and no activity', () => {
      const result = dashboardSummarySchema.safeParse({
        facilityId: 'fac-1',
        totalStockBags: 0,
        activeGrns: 0,
        closedGrns: 0,
        monthlyInwardBags: 0,
        monthlyDeliveredBags: 0,
        chamberStock: [],
        commodityBreakdown: [],
        recentActivity: [],
        generatedAt: new Date(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects capacity and utilization keys outright', () => {
      expect(
        dashboardSummarySchema.safeParse({ ...validSummary, utilizationRate: 40 }).success,
      ).toBe(false);
      expect(
        dashboardSummarySchema.safeParse({ ...validSummary, totalCapacityBags: 2000 }).success,
      ).toBe(false);
      expect(
        dashboardSummarySchema.safeParse({ ...validSummary, chamberUtilization: [] }).success,
      ).toBe(false);
    });
  });
});