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
import { seedLedgerEntry } from './helpers/ledger-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P8 ExportService column contracts.
 *
 * Every export's header row is an exact, ordered set. `chamberNumber` and `positionCode` are gone
 * — both are now the single free-text `chamber` label — and the customer export dropped
 * `mobile`, `address` and `gstin` with the customer model, so its header is name/isActive/createdAt.
 *
 * NOT in scope here: streaming mechanics (export.service.test.ts) and cross-facility isolation
 * (export.isolation.test.ts).
 */
describe('P8 ExportService column headers', () => {
  const facilityId = 'fac-exp-head';

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
    await seedFacility({ id: facilityId, code: 'HDR' });
  });

  it('customer export emits exactly name, isActive, createdAt', async () => {
    await seedCustomer({ facilityId, name: 'Header Farmer' });
    const capture = await captureCsv((res) => exportService.exportCustomers(facilityId, {}, res));

    expect(capture.header).toEqual(['name', 'isActive', 'createdAt']);
    expect(capture.header).not.toContain('mobile');
    expect(capture.header).not.toContain('address');
    expect(capture.header).not.toContain('gstin');
    expect(capture.rows[1]).toContain('Header Farmer');
  });

  it('stock-summary export emits exactly chamber, totalBags', async () => {
    await seedLedgerEntry({ facilityId, chamber: 'CH-01', quantity: 200 });
    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityId, res));

    expect(capture.header).toEqual(['chamber', 'totalBags']);
    for (const removed of [
      'chamberNumber',
      'isActive',
      'capacityBags',
      'occupiedBags',
      'availableBags',
      'utilizationRate',
    ]) {
      expect(capture.header).not.toContain(removed);
    }
    expect(capture.rows[1]).toBe('CH-01,200');
  });

  it('stock-summary export sets filename and content type without chunked transfer', async () => {
    const capture = await captureCsv((res) => exportService.exportStockSummary(facilityId, res));

    expect(capture.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(capture.headers['content-disposition']).toContain(`stock-summary-${facilityId}.csv`);
    // The stock summary is written row-by-row, not streamed through the chunked pipeline.
    expect(capture.headers['transfer-encoding']).toBeUndefined();
  });

  it('GRN export uses chamber instead of chamberNumber', async () => {
    await seedGrn({ facilityId, grnNumber: 'GRN-HDR-001', chamber: 'Block D', bags: 12 });
    const capture = await captureCsv((res) => exportService.exportGrns(facilityId, {}, res));

    expect(capture.header).toContain('chamber');
    expect(capture.header).not.toContain('chamberNumber');
    expect(capture.rows[1]).toContain('Block D');
    expect(capture.rows[1]).toContain('GRN-HDR-001');
  });

  it('delivery export uses chamber instead of chamberNumber', async () => {
    await DeliveryChallanModel.create({
      id: 'del-hdr-1',
      facilityId,
      challanNumber: 'CHL-HDR-001',
      date: new Date(),
      grnId: 'grn-hdr-1',
      grnNumber: 'GRN-HDR-001',
      customerId: 'cust-hdr-1',
      customerName: 'HDR Farmer',
      commodityId: 'cmd-hdr-1',
      commodityName: 'Potato',
      chamber: 'Block E',
      bags: 7,
      totalBags: 7,
      status: 'ISSUED',
      issuedBy: 'usr-fixture',
    });
    const capture = await captureCsv((res) => exportService.exportDeliveries(facilityId, {}, res));

    expect(capture.header).toContain('chamber');
    expect(capture.header).not.toContain('chamberNumber');
    expect(capture.rows[1]).toContain('Block E');
  });

  it('ledger export uses chamber instead of positionCode', async () => {
    await seedLedgerEntry({ facilityId, chamber: 'Shed F', quantity: 42 });
    const capture = await captureCsv((res) =>
      exportService.exportInventoryLedger(facilityId, {}, res),
    );

    expect(capture.header).toContain('chamber');
    expect(capture.header).not.toContain('positionCode');
    expect(capture.rows[1]).toContain('Shed F');
    expect(capture.rows[1]).toContain('INWARD_PUTAWAY');
  });

  it('emits the header row even when a stream has no matching records', async () => {
    const capture = await captureCsv((res) =>
      exportService.exportInventoryLedger(
        facilityId,
        { from: '2020-01-01', to: '2020-01-02' },
        res,
      ),
    );

    expect(capture.rows).toHaveLength(1);
    expect(capture.header).toEqual([
      'createdAt',
      'transactionType',
      'grnNumber',
      'chamber',
      'commodityId',
      'bagType',
      'quantity',
      'referenceType',
      'referenceId',
      'createdBy',
    ]);
  });
});
