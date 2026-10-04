import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import {
  previousMonthDate,
  seedLedgerEntries,
  seedLedgerEntry,
} from './helpers/ledger-fixtures.js';
import type { SeedLedgerOptions } from './helpers/ledger-fixtures.js';
import { seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P7 DashboardService Unit Tests — the monthly inward / delivered windows.
 *
 * The window is half-open `[startOfMonth, startOfNextMonth)` in Asia/Kolkata, computed by
 * `getIstMonthlyWindow`. It is intentionally independent of `totalStockBags`, which is lifetime:
 * a previous-month put-away still counts toward stock but must not count toward this month.
 *
 * NOT in scope: lifetime stock totals and chamber grouping (dashboard.service.test.ts).
 */
describe('P7 DashboardService monthly window (IST)', () => {
  const facilityId = 'fac-dash-monthly-1';
  const ledger: SeedLedgerOptions = { facilityId, commodityId: 'cmd-monthly-1', chamber: 'CH-1' };

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
    await seedFacility({ id: facilityId, code: 'MON' });
    await seedGrn({ facilityId, chamber: 'CH-1' });
  });

  it('counts INWARD_PUTAWAY within the current IST month', async () => {
    await seedLedgerEntry({
      ...ledger,
      transactionType: 'INWARD_PUTAWAY',
      quantity: 150,
      createdAt: new Date(),
    });
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.monthlyInwardBags).toBe(150);
  });

  it('does not count INWARD_PUTAWAY from a previous month, but still counts it toward stock', async () => {
    await seedLedgerEntry({
      ...ledger,
      transactionType: 'INWARD_PUTAWAY',
      quantity: 999,
      createdAt: previousMonthDate(),
    });
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.monthlyInwardBags).toBe(0);
    expect(summary.totalStockBags).toBe(999);
  });

  it('excludes another facility ledger from both monthly windows', async () => {
    await seedLedgerEntries([
      { ...ledger, transactionType: 'INWARD_PUTAWAY', quantity: 500, createdAt: new Date() },
      {
        ...ledger,
        facilityId: 'fac-dash-monthly-other',
        transactionType: 'INWARD_PUTAWAY',
        quantity: 400,
        createdAt: new Date(),
      },
      {
        ...ledger,
        facilityId: 'fac-dash-monthly-other',
        transactionType: 'OUTWARD_DELIVERY',
        quantity: 300,
        createdAt: new Date(),
      },
    ]);
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.monthlyInwardBags).toBe(500);
    expect(summary.monthlyDeliveredBags).toBe(0);
  });

  it('computes monthlyDeliveredBags = OUTWARD_DELIVERY − DELIVERY_REVERSAL in the current month', async () => {
    const now = new Date();
    await seedLedgerEntries([
      { ...ledger, transactionType: 'INWARD_PUTAWAY', quantity: 500, createdAt: now },
      { ...ledger, transactionType: 'OUTWARD_DELIVERY', quantity: 80, createdAt: now },
      { ...ledger, transactionType: 'DELIVERY_REVERSAL', quantity: 20, createdAt: now },
    ]);
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.monthlyDeliveredBags).toBe(60); // 80 − 20
    expect(summary.monthlyInwardBags).toBe(500);
  });

  it('does not net reversals from a previous month into the current month', async () => {
    const now = new Date();
    await seedLedgerEntries([
      { ...ledger, transactionType: 'OUTWARD_DELIVERY', quantity: 80, createdAt: now },
      {
        ...ledger,
        transactionType: 'DELIVERY_REVERSAL',
        quantity: 20,
        createdAt: previousMonthDate(now),
      },
    ]);
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.monthlyDeliveredBags).toBe(80);
  });

  it('reports 0 for both monthly windows when the ledger is empty', async () => {
    const summary = await dashboardService.getSummary(facilityId);
    expect(summary.monthlyInwardBags).toBe(0);
    expect(summary.monthlyDeliveredBags).toBe(0);
  });
});
