import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';

/**
 * P7 DashboardService Unit Tests
 *
 * Scope: business logic, KPI calculations, ledger polarity, monthly interval,
 * chamber utilization, commodity stock, recent activity projection, and
 * Phase B conditional skip.
 *
 * NOT in scope here: HTTP authentication, RBAC, facilityId authorization.
 * Those belong in dashboard.routes.test.ts.
 */
describe('P7 DashboardService', () => {
  const facilityId = 'fac-dash-svc-1';
  const otherFacilityId = 'fac-dash-svc-other';
  const chamberId = 'ch-dash-1';
  const chamber2Id = 'ch-dash-2';
  const positionId = 'pos-dash-1';
  const position2Id = 'pos-dash-2';
  const commodityId = 'cmd-dash-1';
  const commodity2Id = 'cmd-dash-2';
  const customerId = 'cust-dash-1';
  const grnId = 'grn-dash-1';
  const grnNumber = 'GRN-26-27-001';
  const userId = 'usr-dash-1';

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
    await ChamberModel.deleteMany({});
    await PositionModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await GrnModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await DeliveryReversalModel.deleteMany({});

    // Minimal fixtures — only what each test group needs
    await FacilityModel.create({ id: facilityId, name: 'Test Facility', code: 'TST', isActive: true });
    await FacilityModel.create({ id: otherFacilityId, name: 'Other', code: 'OTH', isActive: true });
    await ChamberModel.create({ id: chamberId, facilityId, chamberNumber: 'CH-1', isActive: true });
    await ChamberModel.create({ id: chamber2Id, facilityId, chamberNumber: 'CH-2', isActive: false });
    await PositionModel.create({ id: positionId, facilityId, chamberId, rackId: 'rk-1', levelId: 'lvl-1', code: 'P1', capacityBags: 500, isActive: true });
    await PositionModel.create({ id: position2Id, facilityId, chamberId: chamber2Id, rackId: 'rk-2', levelId: 'lvl-2', code: 'P2', capacityBags: 300, isActive: false });
    await CommodityModel.create({ id: commodityId, name: 'Wheat', normalizedName: 'wheat', code: 'WHT', isActive: true });
    await CommodityModel.create({ id: commodity2Id, name: 'Rice', normalizedName: 'rice', code: 'RCE', isActive: true });
    await GrnModel.create({ id: grnId, facilityId, grnNumber, inwardReceiptNumber: 'RCPT-26-27-001', date: new Date(), status: 'OPEN', customerId, customerName: 'Test Customer', commodityId, commodityName: 'Wheat', chamberId, chamberNumber: 'CH-1', bags: 500, bagType: 'S', rentType: 'Monthly', rentAmount: 1000, createdBy: userId });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function makeTxn(overrides: Partial<{
    id: string; transactionType: string; quantity: number;
    referenceType: string; referenceId: string; chamberId: string;
    commodityId: string; positionCode: string; createdAt: Date;
  }>) {
    return {
      id: overrides.id ?? 'txn-1',
      facilityId,
      grnId,
      grnNumber,
      chamberId: overrides.chamberId ?? chamberId,
      rackId: 'rk-1',
      levelId: 'lvl-1',
      positionId,
      positionCode: overrides.positionCode ?? 'CH1-R1-L1-P1',
      customerId,
      commodityId: overrides.commodityId ?? commodityId,
      bagType: 'S',
      transactionType: overrides.transactionType ?? 'INWARD_PUTAWAY',
      quantity: overrides.quantity ?? 100,
      referenceType: overrides.referenceType ?? 'PUT_AWAY',
      referenceId: overrides.referenceId ?? 'pa-1',
      notes: null,
      createdBy: userId,
      createdAt: overrides.createdAt ?? new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Capacity & KPI calculations
  // ---------------------------------------------------------------------------
  describe('capacity and KPI calculations', () => {
    it('reports totalCapacityBags as sum of Position.capacityBags for the facility', async () => {
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.totalCapacityBags).toBe(800); // 500 + 300
    });

    it('reports occupiedBags = 0 when ledger is empty', async () => {
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.occupiedBags).toBe(0);
      expect(summary.availableBags).toBe(800);
      expect(summary.utilizationRate).toBe(0);
    });

    it('computes utilizationRate correctly', async () => {
      await InventoryTransactionModel.create(makeTxn({ quantity: 400 })); // INWARD_PUTAWAY +400
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.occupiedBags).toBe(400);
      expect(summary.availableBags).toBe(400);
      // 400/800 × 100 = 50.00
      expect(summary.utilizationRate).toBe(50);
    });

    it('caps utilizationRate at 100', async () => {
      await InventoryTransactionModel.create(makeTxn({ quantity: 900 })); // over capacity
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.utilizationRate).toBe(100);
    });

    it('reports 0 utilizationRate when totalCapacityBags is 0', async () => {
      // Remove all positions for this facility
      await PositionModel.deleteMany({ facilityId });
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.totalCapacityBags).toBe(0);
      expect(summary.utilizationRate).toBe(0);
    });

    it('does not include transactions from other facilities', async () => {
      // Transaction on other facility should not affect this facility's summary
      await InventoryTransactionModel.create({ ...makeTxn({ quantity: 999 }), facilityId: otherFacilityId });
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.occupiedBags).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Ledger polarity — ledgerSignedQuantity applied exactly once
  // ---------------------------------------------------------------------------
  describe('ledger polarity (ledgerSignedQuantity)', () => {
    it('INWARD_PUTAWAY adds bags (+quantity)', async () => {
      await InventoryTransactionModel.create(makeTxn({ transactionType: 'INWARD_PUTAWAY', quantity: 200 }));
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.occupiedBags).toBe(200);
    });

    it('OUTWARD_DELIVERY removes bags (−quantity)', async () => {
      await InventoryTransactionModel.create(makeTxn({ transactionType: 'INWARD_PUTAWAY', quantity: 300 }));
      await InventoryTransactionModel.create(makeTxn({
        id: 'txn-2', transactionType: 'OUTWARD_DELIVERY', quantity: 100,
        referenceType: 'DELIVERY', referenceId: 'del-1',
      }));
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.occupiedBags).toBe(200); // 300 − 100
    });

    it('DELIVERY_REVERSAL restores bags (+quantity)', async () => {
      await InventoryTransactionModel.create(makeTxn({ transactionType: 'INWARD_PUTAWAY', quantity: 300 }));
      await InventoryTransactionModel.create(makeTxn({
        id: 'txn-2', transactionType: 'OUTWARD_DELIVERY', quantity: 100,
        referenceType: 'DELIVERY', referenceId: 'del-1',
      }));
      await InventoryTransactionModel.create(makeTxn({
        id: 'txn-3', transactionType: 'DELIVERY_REVERSAL', quantity: 100,
        referenceType: 'DELIVERY_REVERSAL', referenceId: 'rev-1',
      }));
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.occupiedBags).toBe(300); // 300 − 100 + 100
    });

    it('does not double-count quantity (sum applied once)', async () => {
      // 100 in, 40 out, 40 reversed → net 100 bags
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-a', transactionType: 'INWARD_PUTAWAY', quantity: 100 }));
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-b', transactionType: 'OUTWARD_DELIVERY', quantity: 40, referenceType: 'DELIVERY', referenceId: 'd-1' }));
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-c', transactionType: 'DELIVERY_REVERSAL', quantity: 40, referenceType: 'DELIVERY_REVERSAL', referenceId: 'r-1' }));
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.occupiedBags).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Monthly interval — Asia/Kolkata half-open [startOfMonth, startOfNextMonth)
  // ---------------------------------------------------------------------------
  describe('monthly interval (IST)', () => {
    it('counts INWARD_PUTAWAY within the current IST month', async () => {
      const now = new Date();
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-in-month', transactionType: 'INWARD_PUTAWAY', quantity: 150, createdAt: now }));
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.monthlyInwardBags).toBeGreaterThanOrEqual(150);
    });

    it('does not count INWARD_PUTAWAY from a previous month', async () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-last-month', transactionType: 'INWARD_PUTAWAY', quantity: 999, createdAt: lastMonth }));
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.monthlyInwardBags).toBe(0);
    });

    it('computes monthlyDeliveredBags = OUTWARD_DELIVERY − DELIVERY_REVERSAL in current month', async () => {
      const now = new Date();
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-d1', transactionType: 'OUTWARD_DELIVERY', quantity: 80, referenceType: 'DELIVERY', referenceId: 'd-1', createdAt: now }));
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-r1', transactionType: 'DELIVERY_REVERSAL', quantity: 20, referenceType: 'DELIVERY_REVERSAL', referenceId: 'r-1', createdAt: now }));
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.monthlyDeliveredBags).toBe(60); // 80 − 20
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Chamber utilization
  // ---------------------------------------------------------------------------
  describe('chamber utilization', () => {
    it('includes all chambers including inactive', async () => {
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.chamberUtilization).toHaveLength(2);
      const inactive = summary.chamberUtilization.find((c) => c.chamberId === chamber2Id);
      expect(inactive?.isActive).toBe(false);
    });

    it('chamber reconciliation: sum of chamber occupiedBags equals facility total', async () => {
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-1', transactionType: 'INWARD_PUTAWAY', quantity: 100, chamberId }));
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-2', transactionType: 'INWARD_PUTAWAY', quantity: 50, chamberId: chamber2Id }));
      const summary = await dashboardService.getSummary(facilityId);
      const chamberSum = summary.chamberUtilization.reduce((s, c) => s + c.occupiedBags, 0);
      expect(chamberSum).toBe(summary.occupiedBags);
    });

    it('chamber availableBags is max(0, capacity − occupied)', async () => {
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-x', transactionType: 'INWARD_PUTAWAY', quantity: 600 })); // > capacity of CH-1
      const summary = await dashboardService.getSummary(facilityId);
      const ch1 = summary.chamberUtilization.find((c) => c.chamberId === chamberId);
      expect(ch1?.availableBags).toBe(0); // clamped
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Commodity stock
  // ---------------------------------------------------------------------------
  describe('commodity stock', () => {
    it('resolves commodity name from CommodityModel catalog', async () => {
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-wht', transactionType: 'INWARD_PUTAWAY', quantity: 200, commodityId }));
      const summary = await dashboardService.getSummary(facilityId);
      const stock = summary.commodityBreakdown.find((c) => c.commodityId === commodityId);
      expect(stock?.commodityName).toBe('Wheat');
    });

    it('only reports commodities with positive stock', async () => {
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-in', transactionType: 'INWARD_PUTAWAY', quantity: 100, commodityId }));
      await InventoryTransactionModel.create(makeTxn({ id: 'txn-out', transactionType: 'OUTWARD_DELIVERY', quantity: 100, commodityId, referenceType: 'DELIVERY', referenceId: 'd-1' }));
      const summary = await dashboardService.getSummary(facilityId);
      const stock = summary.commodityBreakdown.find((c) => c.commodityId === commodityId);
      expect(stock).toBeUndefined(); // net 0 → excluded
    });

    it('skips commodity catalog lookup when commodityIds is empty (Phase B short-circuit)', async () => {
      // No transactions → no commodity IDs → Phase B commodity query not executed
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.commodityBreakdown).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. GRN counts
  // ---------------------------------------------------------------------------
  describe('GRN counts', () => {
    it('counts active (OPEN) and closed GRNs correctly', async () => {
      await GrnModel.create({ id: 'grn-2', facilityId, grnNumber: 'GRN-26-27-002', inwardReceiptNumber: 'RCPT-26-27-002', date: new Date(), status: 'CLOSED', customerId, customerName: 'Test Customer', commodityId, commodityName: 'Wheat', chamberId, chamberNumber: 'CH-1', bags: 100, bagType: 'S', rentType: 'Monthly', rentAmount: 500, createdBy: userId });
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.activeGrns).toBe(1); // from beforeEach
      expect(summary.closedGrns).toBe(1);
    });

    it('returns 0 for both when no GRNs exist', async () => {
      await GrnModel.deleteMany({});
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.activeGrns).toBe(0);
      expect(summary.closedGrns).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Recent Activity — projection, field mapping, reference resolution
  // ---------------------------------------------------------------------------
  describe('recentActivity projection', () => {
    it('limits recent activity to at most 10 records', async () => {
      const txns = Array.from({ length: 12 }, (_, i) =>
        makeTxn({ id: `txn-many-${i}`, transactionType: 'INWARD_PUTAWAY', quantity: 10 + i }),
      );
      await InventoryTransactionModel.insertMany(txns);
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.recentActivity.length).toBeLessThanOrEqual(10);
    });

    it('orders recent activity descending by createdAt', async () => {
      const t1 = new Date('2026-09-01T10:00:00Z');
      const t2 = new Date('2026-09-02T10:00:00Z');
      await InventoryTransactionModel.insertMany([
        makeTxn({ id: 'txn-old', transactionType: 'INWARD_PUTAWAY', quantity: 10, createdAt: t1 }),
        makeTxn({ id: 'txn-new', transactionType: 'INWARD_PUTAWAY', quantity: 20, createdAt: t2 }),
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.recentActivity[0].bags).toBe(20); // newest first
    });

    it('only includes the three approved transaction types', async () => {
      await InventoryTransactionModel.insertMany([
        makeTxn({ id: 'txn-p', transactionType: 'INWARD_PUTAWAY', quantity: 10 }),
        makeTxn({ id: 'txn-d', transactionType: 'OUTWARD_DELIVERY', quantity: 5, referenceType: 'DELIVERY', referenceId: 'd-1' }),
        makeTxn({ id: 'txn-r', transactionType: 'DELIVERY_REVERSAL', quantity: 5, referenceType: 'DELIVERY_REVERSAL', referenceId: 'r-1' }),
      ]);
      const summary = await dashboardService.getSummary(facilityId);
      const types = new Set(summary.recentActivity.map((a) => a.type));
      for (const t of types) {
        expect(['INWARD_PUTAWAY', 'OUTWARD_DELIVERY', 'DELIVERY_REVERSAL']).toContain(t);
      }
    });

    it('INWARD_PUTAWAY: referenceNumber is grnNumber (direct field)', async () => {
      await InventoryTransactionModel.create(makeTxn({
        id: 'txn-pa', transactionType: 'INWARD_PUTAWAY', quantity: 50,
        referenceType: 'PUT_AWAY', referenceId: 'pa-1',
      }));
      const summary = await dashboardService.getSummary(facilityId);
      const activity = summary.recentActivity.find((a) => a.type === 'INWARD_PUTAWAY');
      expect(activity?.referenceNumber).toBe(grnNumber);
    });

    it('OUTWARD_DELIVERY: referenceNumber is challanNumber resolved via referenceId', async () => {
      const deliveryId = 'del-ref-1';
      await DeliveryChallanModel.create({
        id: deliveryId, facilityId, challanNumber: 'DC-26-27-001',
        date: new Date(), grnId, grnNumber, customerId, customerName: 'TestCust',
        commodityId, commodityName: 'Wheat', chamberId, chamberNumber: 'CH-1',
        items: [{ positionId, positionCode: 'P1', bags: 50 }], totalBags: 50,
        vehicleNumber: null, driverName: null, weight: null, remarks: null,
        status: 'ISSUED', issuedBy: userId,
      });
      await InventoryTransactionModel.create(makeTxn({
        id: 'txn-del', transactionType: 'OUTWARD_DELIVERY', quantity: 50,
        referenceType: 'DELIVERY', referenceId: deliveryId,
      }));
      const summary = await dashboardService.getSummary(facilityId);
      const activity = summary.recentActivity.find((a) => a.type === 'OUTWARD_DELIVERY');
      expect(activity?.referenceNumber).toBe('DC-26-27-001');
    });

    it('DELIVERY_REVERSAL: referenceNumber is challanNumber resolved via referenceId', async () => {
      const deliveryId = 'del-rev-ref-1';
      const reversalId = 'rev-ref-1';
      await DeliveryReversalModel.create({
        id: reversalId, facilityId, deliveryId, challanNumber: 'DC-26-27-002',
        grnId, reason: 'Test reason', reversedBy: userId, reversedAt: new Date(),
      });
      await InventoryTransactionModel.create(makeTxn({
        id: 'txn-rev', transactionType: 'DELIVERY_REVERSAL', quantity: 30,
        referenceType: 'DELIVERY_REVERSAL', referenceId: reversalId,
      }));
      const summary = await dashboardService.getSummary(facilityId);
      const activity = summary.recentActivity.find((a) => a.type === 'DELIVERY_REVERSAL');
      expect(activity?.referenceNumber).toBe('DC-26-27-002');
    });

    it('positionCode comes directly from the transaction (no lookup)', async () => {
      await InventoryTransactionModel.create(makeTxn({
        id: 'txn-pc', transactionType: 'INWARD_PUTAWAY', quantity: 10,
        positionCode: 'CH1-R2-L3-P4',
      }));
      const summary = await dashboardService.getSummary(facilityId);
      expect(summary.recentActivity[0].positionCode).toBe('CH1-R2-L3-P4');
    });

    it('bags is always the positive display quantity from the transaction', async () => {
      await InventoryTransactionModel.create(makeTxn({
        id: 'txn-qty', transactionType: 'OUTWARD_DELIVERY', quantity: 75,
        referenceType: 'DELIVERY', referenceId: 'x-1',
      }));
      const summary = await dashboardService.getSummary(facilityId);
      const activity = summary.recentActivity.find((a) => a.type === 'OUTWARD_DELIVERY');
      expect(activity?.bags).toBe(75); // positive, not −75
    });

    it('skips Phase B challan lookup when deliveryIds is empty', async () => {
      // Only put-away transactions — no OUTWARD_DELIVERY, no Phase B challan query
      await InventoryTransactionModel.create(makeTxn({ transactionType: 'INWARD_PUTAWAY', quantity: 10 }));
      const summary = await dashboardService.getSummary(facilityId);
      // If Phase B was incorrectly executed, it would fail with a DB error on empty $in
      // Verify graceful execution
      expect(summary.recentActivity).toHaveLength(1);
      expect(summary.recentActivity[0].type).toBe('INWARD_PUTAWAY');
    });
  });
});
