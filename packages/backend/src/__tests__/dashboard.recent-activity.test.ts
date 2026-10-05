import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import { seedLedgerEntries, seedLedgerEntry } from './helpers/ledger-fixtures.js';
import type { SeedLedgerOptions } from './helpers/ledger-fixtures.js';
import { seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P7 DashboardService Unit Tests — recent activity projection.
 *
 * `recentActivity` is a read-only projection over the newest ledger entries: it carries the
 * free-text `chamber` label straight off the transaction (`positionCode` no longer exists),
 * resolves `referenceNumber` per transaction type, and always displays a positive bag count.
 *
 * NOT in scope: lifetime stock totals and chamber grouping (dashboard.service.test.ts).
 */
describe('P7 DashboardService recentActivity projection', () => {
  const facilityId = 'fac-dash-activity-1';
  const grnId = 'grn-dash-activity-1';
  const grnNumber = 'GRN-26-27-001';
  const ledger: SeedLedgerOptions = {
    facilityId,
    grnId,
    grnNumber,
    commodityId: 'cmd-activity-1',
    chamber: 'CH-1',
  };

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await GrnModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await DeliveryReversalModel.deleteMany({});
    await seedFacility({ id: facilityId, code: 'ACT' });
    await seedGrn({ facilityId, grnNumber, chamber: 'CH-1' });
  });

  it('limits recent activity to at most 10 records', async () => {
    await seedLedgerEntries(
      Array.from({ length: 12 }, (_, i) => ({
        ...ledger,
        transactionType: 'INWARD_PUTAWAY' as const,
        smallQuantity: 10, bigQuantity: 0 + i,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)),
      })),
    );
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.recentActivity).toHaveLength(10);
  });

  it('orders recent activity descending by createdAt', async () => {
    await seedLedgerEntries([
      {
        ...ledger,
        transactionType: 'INWARD_PUTAWAY',
        smallQuantity: 10,
        bigQuantity: 0,
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
      },
      {
        ...ledger,
        transactionType: 'INWARD_PUTAWAY',
        smallQuantity: 20,
        bigQuantity: 0,
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
      },
    ]);
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.recentActivity[0].bags).toBe(20); // newest first
  });

  it('only includes the three approved transaction types', async () => {
    await seedLedgerEntries([
      { ...ledger, transactionType: 'INWARD_PUTAWAY', smallQuantity: 10, bigQuantity: 0 },
      { ...ledger, transactionType: 'OUTWARD_DELIVERY', smallQuantity: 5, bigQuantity: 0 },
      { ...ledger, transactionType: 'DELIVERY_REVERSAL', smallQuantity: 5, bigQuantity: 0 },
    ]);
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.recentActivity.map((a) => a.type).sort()).toEqual([
      'DELIVERY_REVERSAL',
      'INWARD_PUTAWAY',
      'OUTWARD_DELIVERY',
    ]);
  });

  it('excludes ledger entries from another facility', async () => {
    await seedLedgerEntry({
      ...ledger,
      facilityId: 'fac-dash-activity-other',
      transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 10,
      bigQuantity: 0,
    });
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.recentActivity).toHaveLength(0);
  });

  it('INWARD_PUTAWAY: referenceNumber is grnNumber (direct field)', async () => {
    await seedLedgerEntry({ ...ledger, transactionType: 'INWARD_PUTAWAY', smallQuantity: 50, bigQuantity: 0 });
    const summary = await dashboardService.getSummary(facilityId);
    const activity = summary.recentActivity.find((a) => a.type === 'INWARD_PUTAWAY');
    expect(activity?.referenceNumber).toBe(grnNumber);
  });

  it('OUTWARD_DELIVERY: referenceNumber is challanNumber resolved via referenceId', async () => {
    const deliveryId = 'del-ref-1';
    await DeliveryChallanModel.create({
      id: deliveryId,
      facilityId,
      challanNumber: 'DC-26-27-001',
      date: new Date(),
      grnId,
      grnNumber,
      customerId: 'cust-activity-1',
      customerName: 'TestCust',
      commodityId: 'cmd-activity-1',
      commodityName: 'Wheat',
      chamber: 'CH-1',
      smallBags: 50,
      bigBags: 0,
      totalBags: 50,
      status: 'ISSUED',
      issuedBy: 'usr-fixture',
    });
    await seedLedgerEntry({
      ...ledger,
      transactionType: 'OUTWARD_DELIVERY',
      smallQuantity: 50,
      bigQuantity: 0,
      referenceId: deliveryId,
    });
    const summary = await dashboardService.getSummary(facilityId);
    const activity = summary.recentActivity.find((a) => a.type === 'OUTWARD_DELIVERY');
    expect(activity?.referenceNumber).toBe('DC-26-27-001');
  });

  it('DELIVERY_REVERSAL: referenceNumber is challanNumber resolved via referenceId', async () => {
    const reversalId = 'rev-ref-1';
    await DeliveryReversalModel.create({
      id: reversalId,
      facilityId,
      deliveryId: 'del-rev-1',
      challanNumber: 'DC-26-27-002',
      grnId,
      reason: 'Test reason',
      reversedBy: 'usr-fixture',
      reversedAt: new Date(),
    });
    await seedLedgerEntry({
      ...ledger,
      transactionType: 'DELIVERY_REVERSAL',
      smallQuantity: 30,
      bigQuantity: 0,
      referenceId: reversalId,
    });
    const summary = await dashboardService.getSummary(facilityId);
    const activity = summary.recentActivity.find((a) => a.type === 'DELIVERY_REVERSAL');
    expect(activity?.referenceNumber).toBe('DC-26-27-002');
  });

  it('chamber comes directly from the transaction (no entity lookup)', async () => {
    await seedLedgerEntry({
      ...ledger,
      transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 10,
      bigQuantity: 0,
      chamber: 'Block B - Shed 2',
    });
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.recentActivity[0].chamber).toBe('Block B - Shed 2');
    expect(summary.recentActivity[0]).not.toHaveProperty('positionCode');
  });

  it('bags is always the positive display quantity from the transaction', async () => {
    await seedLedgerEntry({
      ...ledger,
      transactionType: 'OUTWARD_DELIVERY',
      smallQuantity: 75,
      bigQuantity: 0,
      referenceId: 'x-1',
    });
    const summary = await dashboardService.getSummary(facilityId);
    const activity = summary.recentActivity.find((a) => a.type === 'OUTWARD_DELIVERY');
    expect(activity?.bags).toBe(75); // positive, not −75
  });

  it('skips the Phase B challan lookup when deliveryIds is empty', async () => {
    // Only put-away transactions — an empty $in would fail if the lookup still ran.
    await seedLedgerEntry({ ...ledger, transactionType: 'INWARD_PUTAWAY', smallQuantity: 10, bigQuantity: 0 });
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.recentActivity).toHaveLength(1);
    expect(summary.recentActivity[0].type).toBe('INWARD_PUTAWAY');
    expect(summary.recentActivity[0].summary).toContain('CH-1');
  });
});
