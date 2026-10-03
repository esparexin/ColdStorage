import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import { exportService } from '../modules/import-export/export.service.js';
import { captureCsv } from './helpers/csv-response-fixtures.js';
import { seedLedgerEntries, seedLedgerEntry } from './helpers/ledger-fixtures.js';
import { seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P8 Stock Summary Export — ledger-derived chamber stock.
 *
 * The summary reports stock held per free-text chamber label and nothing else: there is no
 * capacity, availability or utilization column because a chamber label has no denominator. Both
 * this export and the P7 dashboard apply the canonical `ledgerSignedQuantity` expression exactly
 * once, so the two must agree on identical fixtures.
 *
 * NOT in scope here: column headers (export.headers.test.ts) and isolation
 * (export.isolation.test.ts).
 */
describe('P8 Stock Summary Export', () => {
  const facilityId = 'fac-exp-stock';

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
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
    await DeliveryChallanModel.deleteMany({});
    await DeliveryReversalModel.deleteMany({});
    await seedFacility({ id: facilityId, code: 'STK' });
    await seedGrn({ facilityId, chamber: 'CH-01' });
  });

  it('reports a single chamber row from the canonical signed ledger sum', async () => {
    await seedLedgerEntry({ facilityId, chamber: 'CH-01', quantity: 200 });
    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityId, res));

    expect(capture.rows).toEqual(['chamber,totalBags', 'CH-01,200']);
  });

  it('nets deliveries and reversals into the chamber total', async () => {
    await seedLedgerEntries([
      { facilityId, chamber: 'CH-01', transactionType: 'INWARD_PUTAWAY', quantity: 300 },
      { facilityId, chamber: 'CH-01', transactionType: 'OUTWARD_DELIVERY', quantity: 50 },
      { facilityId, chamber: 'CH-01', transactionType: 'DELIVERY_REVERSAL', quantity: 20 },
    ]);
    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityId, res));

    expect(capture.rows).toEqual(['chamber,totalBags', 'CH-01,270']); // 300 − 50 + 20
  });

  it('omits chamber labels whose net stock is not positive', async () => {
    await seedLedgerEntries([
      { facilityId, chamber: 'CH-01', transactionType: 'INWARD_PUTAWAY', quantity: 100 },
      { facilityId, chamber: 'CH-02', transactionType: 'INWARD_PUTAWAY', quantity: 40 },
      { facilityId, chamber: 'CH-02', transactionType: 'OUTWARD_DELIVERY', quantity: 40 },
    ]);
    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityId, res));

    expect(capture.rows).toEqual(['chamber,totalBags', 'CH-01,100']);
  });

  it('orders chamber rows by descending totalBags', async () => {
    await seedLedgerEntries([
      { facilityId, chamber: 'CH-01', quantity: 100 },
      { facilityId, chamber: 'CH-02', quantity: 300 },
      { facilityId, chamber: 'CH-03', quantity: 200 },
    ]);
    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityId, res));

    expect(capture.rows.slice(1)).toEqual(['CH-02,300', 'CH-03,200', 'CH-01,100']);
  });

  it('emits only the header row when the facility holds no stock', async () => {
    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityId, res));

    expect(capture.rows).toEqual(['chamber,totalBags']);
  });

  it('P7 / P8 Stock Summary reconciliation: sum of exported chamber bags equals the dashboard totalStockBags', async () => {
    await seedLedgerEntries([
      { facilityId, chamber: 'CH-01', transactionType: 'INWARD_PUTAWAY', quantity: 300 },
      { facilityId, chamber: 'CH-01', transactionType: 'OUTWARD_DELIVERY', quantity: 50 },
      { facilityId, chamber: 'CH-02', transactionType: 'INWARD_PUTAWAY', quantity: 100 },
      { facilityId, chamber: 'CH-02', transactionType: 'DELIVERY_REVERSAL', quantity: 25 },
    ]);

    const p7Summary = await dashboardService.getSummary(facilityId);
    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityId, res));

    const exportTotal = capture.rows
      .slice(1)
      .reduce((sum, line) => sum + parseInt(line.split(',')[1], 10), 0);

    // Exact reconciliation invariant: both surfaces apply ledgerSignedQuantity once.
    expect(exportTotal).toBe(p7Summary.totalStockBags);
    expect(exportTotal).toBe(375); // 300 − 50 + 100 + 25
    expect(capture.rows.slice(1)).toEqual(
      p7Summary.chamberStock.map((c) => `${c.chamber},${c.totalBags}`),
    );
  });
});
