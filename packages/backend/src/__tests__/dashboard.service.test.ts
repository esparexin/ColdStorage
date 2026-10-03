import mongoose from 'mongoose';
import { dashboardSummarySchema } from '@cold-storage/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import { seedLedgerEntries, seedLedgerEntry } from './helpers/ledger-fixtures.js';
import type { SeedLedgerOptions } from './helpers/ledger-fixtures.js';
import { seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P7 DashboardService Unit Tests — stock derivation.
 *
 * Scope: ledger-derived stock totals, free-text chamber grouping, commodity breakdown and
 * open/closed GRN counts. There is no capacity, occupancy or utilization to report: chamber is a
 * free-text label with no denominator, so `totalCapacityBags`, `occupiedBags`, `availableBags`,
 * `utilizationRate` and `chamberUtilization` were removed; `totalStockBags` and `chamberStock`
 * are the stock-derivation replacements asserted here.
 *
 * NOT in scope: the monthly window (dashboard.monthly-window.test.ts), recent activity
 * (dashboard.recent-activity.test.ts), HTTP auth/RBAC/scope (dashboard.routes.test.ts).
 */
describe('P7 DashboardService stock derivation', () => {
  const facilityId = 'fac-dash-svc-1';
  const otherFacilityId = 'fac-dash-svc-other';
  const wheatId = 'cmd-dash-wheat';
  const wheat: SeedLedgerOptions = { facilityId, commodityId: wheatId, chamber: 'CH-1' };

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await GrnModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});

    await seedFacility({ id: facilityId, name: 'Test Facility', code: 'TST' });
    await seedFacility({ id: otherFacilityId, name: 'Other Facility', code: 'OTH' });
    await CommodityModel.create({
      id: wheatId,
      name: 'Wheat',
      normalizedName: 'wheat',
      isActive: true,
    });
    await seedGrn({
      facilityId,
      commodityId: wheatId,
      commodityName: 'Wheat',
      chamber: 'CH-1',
      bags: 500,
      status: 'OPEN',
    });
  });

  // 1. totalStockBags — derived from signed ledger quantities
  describe('totalStockBags (ledgerSignedQuantity applied exactly once)', () => {
    it('reports totalStockBags 0 when the ledger is empty', async () => {
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.totalStockBags).toBe(0);
    });

    it('INWARD_PUTAWAY adds bags (+quantity)', async () => {
      await seedLedgerEntry({ ...wheat, transactionType: 'INWARD_PUTAWAY', quantity: 200 });
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.totalStockBags).toBe(200);
    });

    it('OUTWARD_DELIVERY removes bags (−quantity)', async () => {
      await seedLedgerEntries([
        { ...wheat, transactionType: 'INWARD_PUTAWAY', quantity: 300 },
        { ...wheat, transactionType: 'OUTWARD_DELIVERY', quantity: 100 },
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.totalStockBags).toBe(200); // 300 − 100
    });

    it('DELIVERY_REVERSAL restores bags (+quantity)', async () => {
      await seedLedgerEntries([
        { ...wheat, transactionType: 'INWARD_PUTAWAY', quantity: 300 },
        { ...wheat, transactionType: 'OUTWARD_DELIVERY', quantity: 100 },
        { ...wheat, transactionType: 'DELIVERY_REVERSAL', quantity: 100 },
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.totalStockBags).toBe(300); // 300 − 100 + 100
    });

    it('does not double-count quantity (sum applied once)', async () => {
      await seedLedgerEntries([
        { ...wheat, transactionType: 'INWARD_PUTAWAY', quantity: 100 },
        { ...wheat, transactionType: 'OUTWARD_DELIVERY', quantity: 40 },
        { ...wheat, transactionType: 'DELIVERY_REVERSAL', quantity: 40 },
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.totalStockBags).toBe(100);
    });

    it('does not include ledger entries from other facilities', async () => {
      await seedLedgerEntry({
        facilityId: otherFacilityId,
        transactionType: 'INWARD_PUTAWAY',
        quantity: 999,
      });
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.totalStockBags).toBe(0);
      expect(summary.chamberStock).toHaveLength(0);
    });

    it('reports no capacity or utilization keys (removed fields fail the strict schema)', async () => {
      await seedLedgerEntry({ ...wheat, quantity: 120 });
      const summary = await dashboardService.getSummary(facilityId);

      expect(dashboardSummarySchema.safeParse(summary).success).toBe(true);
      const record = summary as unknown as Record<string, unknown>;
      for (const removed of [
        'totalCapacityBags',
        'occupiedBags',
        'availableBags',
        'utilizationRate',
        'chamberUtilization',
      ]) {
        expect(record).not.toHaveProperty(removed);
      }
    });
  });

  // 2. chamberStock — stock grouped by free-text chamber label
  describe('chamberStock grouping', () => {
    it('groups signed quantities by the free-text chamber label', async () => {
      await seedLedgerEntries([
        { ...wheat, chamber: 'CH-1', quantity: 100 },
        { ...wheat, chamber: 'CH-1', quantity: 50 },
        { ...wheat, chamber: 'Block B', quantity: 25 },
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.chamberStock).toEqual([
        { chamber: 'CH-1', totalBags: 150 },
        { chamber: 'Block B', totalBags: 25 },
      ]);
    });

    it('nets outward deliveries out of the chamber they were dispatched from', async () => {
      await seedLedgerEntries([
        { ...wheat, chamber: 'CH-1', transactionType: 'INWARD_PUTAWAY', quantity: 300 },
        { ...wheat, chamber: 'CH-1', transactionType: 'OUTWARD_DELIVERY', quantity: 50 },
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.chamberStock).toEqual([{ chamber: 'CH-1', totalBags: 250 }]);
    });

    it('omits labels whose net stock is not positive', async () => {
      await seedLedgerEntries([
        { ...wheat, chamber: 'CH-1', transactionType: 'INWARD_PUTAWAY', quantity: 100 },
        { ...wheat, chamber: 'CH-9', transactionType: 'OUTWARD_DELIVERY', quantity: 100 },
        { ...wheat, chamber: 'CH-8', transactionType: 'INWARD_PUTAWAY', quantity: 40 },
        { ...wheat, chamber: 'CH-8', transactionType: 'OUTWARD_DELIVERY', quantity: 40 },
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.chamberStock).toEqual([{ chamber: 'CH-1', totalBags: 100 }]);
    });

    it('reconciles: sum of chamberStock totalBags equals facility totalStockBags', async () => {
      await seedLedgerEntries([
        { ...wheat, chamber: 'CH-1', quantity: 100 },
        { ...wheat, chamber: 'Block B', quantity: 50 },
        { ...wheat, chamber: 'Block B', transactionType: 'OUTWARD_DELIVERY', quantity: 20 },
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      const chamberSum = summary.chamberStock.reduce((s, c) => s + c.totalBags, 0);
      expect(chamberSum).toBe(summary.totalStockBags);
    });
  });

  // 3. Commodity stock
  describe('commodity stock', () => {
    it('resolves commodity name from the CommodityModel catalog', async () => {
      await seedLedgerEntry({ ...wheat, quantity: 200 });
      const summary = await dashboardService.getSummary(facilityId);
      const stock = summary.commodityBreakdown.find((c) => c.commodityId === wheatId);
      expect(stock).toEqual({ commodityId: wheatId, commodityName: 'Wheat', totalBags: 200 });
    });

    it('falls back to the commodity id when the catalog lookup finds nothing', async () => {
      await seedLedgerEntry({ ...wheat, commodityId: 'cmd-unknown', quantity: 10 });
      const summary = await dashboardService.getSummary(facilityId);
      const stock = summary.commodityBreakdown.find((c) => c.commodityId === 'cmd-unknown');
      expect(stock?.commodityName).toBe('cmd-unknown');
    });

    it('only reports commodities with positive stock', async () => {
      await seedLedgerEntries([
        { ...wheat, transactionType: 'INWARD_PUTAWAY', quantity: 100 },
        { ...wheat, transactionType: 'OUTWARD_DELIVERY', quantity: 100 },
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.commodityBreakdown).toHaveLength(0);
    });

    it('skips the commodity catalog lookup when commodityIds is empty (Phase B short-circuit)', async () => {
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.commodityBreakdown).toHaveLength(0);
    });
  });

  // 4. GRN counts
  describe('GRN counts', () => {
    it('counts active (OPEN) and closed GRNs correctly', async () => {
      await seedGrn({ facilityId, status: 'CLOSED', bags: 100 });
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.activeGrns).toBe(1); // seeded in beforeEach
      expect(summary.closedGrns).toBe(1);
    });

    it('excludes GRNs belonging to another facility', async () => {
      await seedGrn({ facilityId: otherFacilityId, status: 'CLOSED' });
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.activeGrns).toBe(1);
      expect(summary.closedGrns).toBe(0);
    });

    it('returns 0 for both when no GRNs exist', async () => {
      await GrnModel.deleteMany({});
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.activeGrns).toBe(0);
      expect(summary.closedGrns).toBe(0);
    });
  });
});
