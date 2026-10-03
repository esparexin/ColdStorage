import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { seedCustomer } from './helpers/master-data-fixtures.js';
import {
  IMPORT_FACILITY_ID,
  IMPORT_USER_ID,
  connectImportDatabase,
  createImportHarness,
  disconnectImportDatabase,
  resetImportDatabase,
  seedImportMasterData,
  type ImportHarness,
} from './helpers/import-fixtures.js';

const GRN_HEADER = 'date,customerName,commodityName,chamber,bags,bagType,rentType,rentAmount';

/**
 * GRN CSV import.
 *
 * The `chamber` column is free text: it is stored on the receipt verbatim, never resolved
 * against a managed entity, so there is no chamber query and no "chamber not found or
 * inactive" rejection to assert. Customer and commodity references are still resolved, and
 * still in batched reads.
 */
describe('ImportService — GRN CSV import', () => {
  let harness: ImportHarness;

  beforeAll(async () => {
    await connectImportDatabase();
  });

  afterAll(async () => {
    await disconnectImportDatabase();
  });

  beforeEach(async () => {
    await resetImportDatabase();
    await seedImportMasterData();
    await seedCustomer({
      id: 'cust-import-active',
      name: 'Farmer 1',
      facilityId: IMPORT_FACILITY_ID,
    });
    harness = createImportHarness();
  });

  it('transaction ownership: delegates persistence to GrnService without opening an outer session', async () => {
    const startSessionSpy = vi.spyOn(mongoose, 'startSession');
    const grnServiceSpy = vi.spyOn(harness.grnService, 'createGrn');

    const csv = [GRN_HEADER, '2026-10-01,Farmer 1,Potato,CH-01,50,S,Seasonal,500'].join('\n');
    await harness.importService.importGrns(IMPORT_FACILITY_ID, csv, IMPORT_USER_ID);

    expect(grnServiceSpy).toHaveBeenCalledTimes(1);
    expect(startSessionSpy).toHaveBeenCalledTimes(1);

    grnServiceSpy.mockRestore();
    startSessionSpy.mockRestore();
  });

  it('resolves customer and commodity in exactly 2 batched read-only queries', async () => {
    const customerSpy = vi.spyOn(CustomerModel, 'find');
    const commoditySpy = vi.spyOn(CommodityModel, 'find');

    const csv = [
      GRN_HEADER,
      '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000',
      '2026-10-02,Farmer 1,Potato,CH-02,120,S,Seasonal,1200',
    ].join('\n');

    const summary = await harness.importService.importGrns(IMPORT_FACILITY_ID, csv, IMPORT_USER_ID);

    expect(summary.committed).toBe(2);
    expect(customerSpy).toHaveBeenCalledTimes(1);
    expect(commoditySpy).toHaveBeenCalledTimes(1);

    customerSpy.mockRestore();
    commoditySpy.mockRestore();
  });

  it('passes the chamber column through as free text with no existence check', async () => {
    const csv = [GRN_HEADER, '2026-10-01,Farmer 1,Potato,UNLISTED-9,100,S,Seasonal,1000'].join(
      '\n',
    );

    const summary = await harness.importService.importGrns(IMPORT_FACILITY_ID, csv, IMPORT_USER_ID);
    expect(summary.committed).toBe(1);
    expect(summary.rejected).toBe(0);

    const grn = await GrnModel.findOne({ id: summary.results[0].id });
    expect(grn?.chamber).toBe('UNLISTED-9');
  });

  it('rejects a row referencing an unknown customer and writes nothing', async () => {
    const csv = [GRN_HEADER, '2026-10-01,Ghost Farmer,Potato,CH-01,100,S,Seasonal,1000'].join('\n');

    const summary = await harness.importService.importGrns(IMPORT_FACILITY_ID, csv, IMPORT_USER_ID);

    expect(summary.totalRows).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.results[0].errors?.[0]).toContain(
      "Customer 'Ghost Farmer' not found or inactive",
    );
    expect(await GrnModel.countDocuments()).toBe(0);
  });

  it('rejects a row referencing a deactivated customer and writes nothing', async () => {
    await seedCustomer({
      id: 'cust-import-inactive',
      name: 'Dormant Farmer',
      facilityId: IMPORT_FACILITY_ID,
      isActive: false,
    });

    const csv = [GRN_HEADER, '2026-10-01,Dormant Farmer,Potato,CH-01,100,S,Seasonal,1000'].join(
      '\n',
    );

    const summary = await harness.importService.importGrns(IMPORT_FACILITY_ID, csv, IMPORT_USER_ID);

    expect(summary.rejected).toBe(1);
    expect(summary.results[0].errors?.[0]).toContain(
      "Customer 'Dormant Farmer' not found or inactive",
    );
    expect(await GrnModel.countDocuments()).toBe(0);
  });

  it('identical operational rows are both committed with distinct sequential grnNumbers', async () => {
    const csv = [
      `${GRN_HEADER},vehicleNumber`,
      '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000,MH12AB1234',
      '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000,MH12AB1234',
    ].join('\n');

    const summary = await harness.importService.importGrns(IMPORT_FACILITY_ID, csv, IMPORT_USER_ID);

    expect(summary.totalRows).toBe(2);
    expect(summary.committed).toBe(2);
    expect(summary.rejected).toBe(0);
    expect(summary.results[0].referenceNumber).not.toBe(summary.results[1].referenceNumber);
  });

  it('counter gapless rollback: a rejected row burns no GRN sequence number', async () => {
    const csv = [
      GRN_HEADER,
      '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000',
      '2026-10-01,Farmer 1,Potato,CH-01,0,S,Seasonal,1000',
    ].join('\n');

    const summary = await harness.importService.importGrns(IMPORT_FACILITY_ID, csv, IMPORT_USER_ID);
    expect(summary.committed).toBe(1);
    expect(summary.rejected).toBe(1);

    const nextCsv = [GRN_HEADER, '2026-10-01,Farmer 1,Potato,CH-01,150,S,Seasonal,1500'].join('\n');
    const nextSummary = await harness.importService.importGrns(
      IMPORT_FACILITY_ID,
      nextCsv,
      IMPORT_USER_ID,
    );
    expect(nextSummary.committed).toBe(1);

    const grns = await GrnModel.find({ facilityId: IMPORT_FACILITY_ID }).sort({ createdAt: 1 });
    expect(grns).toHaveLength(2);
    const [first, second] = grns.map((g) => Number.parseInt(g.grnNumber.split('-').pop()!, 10));
    expect(second).toBe(first + 1);
  });

  it('atomic counter allocation: GRN creation reuses the canonical counter service', async () => {
    const csv = [GRN_HEADER, '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000'].join('\n');

    const summary = await harness.importService.importGrns(IMPORT_FACILITY_ID, csv, IMPORT_USER_ID);
    expect(summary.committed).toBe(1);

    const counter = await CounterModel.findOne({
      facilityId: IMPORT_FACILITY_ID,
      counterType: 'GRN',
    });
    expect(counter).toBeDefined();
    expect(counter?.lastSequence).toBeGreaterThanOrEqual(1);
  });
});
