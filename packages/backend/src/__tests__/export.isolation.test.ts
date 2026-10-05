import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { exportService } from '../modules/import-export/export.service.js';
import { captureCsv } from './helpers/csv-response-fixtures.js';
import { seedLedgerEntries, seedLedgerEntry } from './helpers/ledger-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P8 ExportService cross-facility isolation.
 *
 * Every export is scoped to the requested facility: no GRN, delivery, ledger entry, customer or
 * chamber stock row from another facility may ever appear in the stream. Stock is now grouped by
 * a free-text chamber label, so isolation is proven by label and by quantity rather than by
 * position code.
 *
 * NOT in scope here: column headers (export.headers.test.ts) and streaming mechanics
 * (export.service.test.ts).
 */
describe('P8 ExportService cross-facility isolation', () => {
  const facilityA = 'fac-exp-iso-a';
  const facilityB = 'fac-exp-iso-b';

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await GrnModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await seedFacility({ id: facilityA, name: 'Facility A', code: 'FA' });
    await seedFacility({ id: facilityB, name: 'Facility B', code: 'FB' });
  });

  it('cross-facility isolation (GRN): exporting Facility A contains 0 records from Facility B', async () => {
    await seedGrn({
      facilityId: facilityA,
      grnNumber: 'GRN-A-001',
      chamber: 'CH-A1',
      bags: 10,
      smallBags: 10,
      bigBags: 0,
    });
    await seedGrn({
      facilityId: facilityB,
      grnNumber: 'GRN-B-001',
      chamber: 'CH-B1',
      bags: 20,
      smallBags: 20,
      bigBags: 0,
    });

    const capture = await captureCsv((res) => exportService.exportGrns(facilityA, {}, res));

    expect(capture.body).toContain('GRN-A-001');
    expect(capture.body).not.toContain('GRN-B-001');
    expect(capture.body).not.toContain('CH-B1');
  });

  it('cross-facility isolation (Deliveries): exporting Facility A contains 0 delivery records from Facility B', async () => {
    await DeliveryChallanModel.create([
      {
        id: 'del-iso-a',
        facilityId: facilityA,
        challanNumber: 'CHL-A-001',
        date: new Date(),
        grnId: 'grn-a',
        grnNumber: 'GRN-A-01',
        customerId: 'c1',
        customerName: 'A',
        commodityId: 'cmd1',
        commodityName: 'Pot',
        chamber: 'CH-A1',
        bags: 5,
        smallBags: 5,
        bigBags: 0,
        totalBags: 5,
        status: 'ISSUED',
        issuedBy: 'u1',
      },
      {
        id: 'del-iso-b',
        facilityId: facilityB,
        challanNumber: 'CHL-B-001',
        date: new Date(),
        grnId: 'grn-b',
        grnNumber: 'GRN-B-01',
        customerId: 'c2',
        customerName: 'B',
        commodityId: 'cmd1',
        commodityName: 'Pot',
        chamber: 'CH-B1',
        bags: 10,
        smallBags: 10,
        bigBags: 0,
        totalBags: 10,
        status: 'ISSUED',
        issuedBy: 'u2',
      },
    ]);

    const capture = await captureCsv((res) => exportService.exportDeliveries(facilityA, {}, res));

    expect(capture.body).toContain('CHL-A-001');
    expect(capture.body).not.toContain('CHL-B-001');
    expect(capture.body).not.toContain('CH-B1');
  });

  it('cross-facility isolation (Ledger): exporting Facility A contains 0 ledger records from Facility B', async () => {
    await seedLedgerEntries([
      {
        facilityId: facilityA,
        grnNumber: 'GRN-A-100',
        chamber: 'CH-A1',
        smallQuantity: 50,
        bigQuantity: 0,
      },
      {
        facilityId: facilityB,
        grnNumber: 'GRN-B-100',
        chamber: 'CH-B1',
        smallQuantity: 70,
        bigQuantity: 0,
      },
    ]);

    const capture = await captureCsv((res) =>
      exportService.exportInventoryLedger(facilityA, {}, res),
    );

    expect(capture.body).toContain('GRN-A-100');
    expect(capture.body).not.toContain('GRN-B-100');
    expect(capture.body).not.toContain('CH-B1');
  });

  it('cross-facility isolation (Customer): exporting Facility A contains only customers registered for Facility A', async () => {
    await seedCustomer({ id: 'cust-iso-a', facilityId: facilityA, name: 'Farmer A Only' });
    await seedCustomer({ id: 'cust-iso-b', facilityId: facilityB, name: 'Farmer B Only' });

    const capture = await captureCsv((res) => exportService.exportCustomers(facilityA, {}, res));

    expect(capture.body).toContain('Farmer A Only');
    expect(capture.body).not.toContain('Farmer B Only');
  });

  it('cross-facility isolation (Stock Summary): aggregates only Facility A ledger entries', async () => {
    await seedLedgerEntries([
      { facilityId: facilityA, chamber: 'CH-A1', smallQuantity: 200, bigQuantity: 0 },
      { facilityId: facilityB, chamber: 'CH-B1', smallQuantity: 800, bigQuantity: 0 },
    ]);

    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityA, res));

    expect(capture.rows).toEqual(['chamber,totalBags', 'CH-A1,200']);
    expect(capture.body).not.toContain('CH-B1');
    expect(capture.body).not.toContain('800');
  });

  it('a customer registered to both facilities appears once for each scope', async () => {
    await CustomerModel.create({
      id: 'cust-iso-shared',
      name: 'Shared Farmer',
      facilityIds: [facilityA, facilityB],
      isActive: true,
    });

    const a = await captureCsv((res) => exportService.exportCustomers(facilityA, {}, res));
    const b = await captureCsv((res) => exportService.exportCustomers(facilityB, {}, res));

    expect(a.body).toContain('Shared Farmer');
    expect(b.body).toContain('Shared Farmer');
  });

  it('a facility with no records at all still receives a header-only stream', async () => {
    await seedLedgerEntry({ facilityId: facilityA, chamber: 'CH-A1', smallQuantity: 5, bigQuantity: 0 });
    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityB, res));

    expect(capture.rows).toEqual(['chamber,totalBags']);
  });
});
