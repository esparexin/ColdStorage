import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerModel } from '../database/models/customer.model.js';
import {
  IMPORT_FACILITY_ID,
  IMPORT_OTHER_FACILITY_ID,
  connectImportDatabase,
  createImportHarness,
  disconnectImportDatabase,
  resetImportDatabase,
  seedImportMasterData,
  type ImportHarness,
} from './helpers/import-fixtures.js';

/**
 * Customer CSV import. `name` is the only column, and it is the only customer identity, so
 * duplicates are case-insensitive both inside the file and against the customers already
 * registered for the target facility.
 */
describe('ImportService — customer CSV import', () => {
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
    harness = createImportHarness();
  });

  it('creates each CSV row through the two-argument customer service call', async () => {
    const createSpy = vi.spyOn(harness.customerService, 'createCustomer');

    const summary = await harness.importService.importCustomers(
      IMPORT_FACILITY_ID,
      'name\nTest Farmer',
    );

    expect(summary.totalRows).toBe(1);
    expect(summary.committed).toBe(1);
    expect(createSpy).toHaveBeenCalledWith({ name: 'Test Farmer', isActive: true }, [
      IMPORT_FACILITY_ID,
    ]);

    const created = await CustomerModel.findOne({ name: 'Test Farmer' });
    expect(created?.facilityIds).toEqual([IMPORT_FACILITY_ID]);

    createSpy.mockRestore();
  });

  it('strips a UTF-8 BOM from the header row', async () => {
    const summary = await harness.importService.importCustomers(
      IMPORT_FACILITY_ID,
      '\ufeffname\nAlice',
    );

    expect(summary.totalRows).toBe(1);
    expect(summary.committed).toBe(1);
    expect(summary.results[0].status).toBe('committed');
  });

  it('batched lookup: N customer rows cost exactly 1 duplicate-check query (no N+1)', async () => {
    const findSpy = vi.spyOn(CustomerModel, 'find');

    const csv = ['name', 'Farmer 1', 'Farmer 2', 'Farmer 3'].join('\n');
    const summary = await harness.importService.importCustomers(IMPORT_FACILITY_ID, csv);

    expect(summary.committed).toBe(3);
    expect(findSpy).toHaveBeenCalledTimes(1);

    findSpy.mockRestore();
  });

  it('intra-file duplicate: first row commits, later case-insensitive name match is rejected', async () => {
    const csv = ['name', 'Original Alice', 'ORIGINAL alice'].join('\n');

    const summary = await harness.importService.importCustomers(IMPORT_FACILITY_ID, csv);

    expect(summary.totalRows).toBe(2);
    expect(summary.committed).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.results[0].status).toBe('committed');
    expect(summary.results[1].status).toBe('rejected');
    expect(summary.results[1].errors?.[0]).toContain('Duplicate record within import file');
    expect(summary.results[1].errors?.[0]).toContain('already specified at row 1');
  });

  it('re-registration semantics: a name already registered for the facility is rejected', async () => {
    await harness.customerService.createCustomer({ name: 'Existing Charlie', isActive: true }, [
      IMPORT_FACILITY_ID,
    ]);

    const summary = await harness.importService.importCustomers(
      IMPORT_FACILITY_ID,
      'name\n  EXISTING charlie  ',
    );

    expect(summary.committed).toBe(0);
    expect(summary.rejected).toBe(1);
    expect(summary.results[0].errors?.[0]).toContain('is already registered for this facility');

    // A rejected row must not create a second customer document.
    expect(await CustomerModel.countDocuments({ name: /Existing Charlie/i })).toBe(1);
  });

  it('tenant independence: the same name imported for another facility is a separate customer', async () => {
    await harness.importService.importCustomers(IMPORT_FACILITY_ID, 'name\nShared Grower');
    const otherSummary = await harness.importService.importCustomers(
      IMPORT_OTHER_FACILITY_ID,
      'name\nShared Grower',
    );

    expect(otherSummary.committed).toBe(1);
    expect(otherSummary.rejected).toBe(0);

    const growers = await CustomerModel.find({ name: 'Shared Grower' });
    expect(growers).toHaveLength(2);
    expect(growers.map((c) => c.facilityIds[0]).sort()).toEqual(
      [IMPORT_FACILITY_ID, IMPORT_OTHER_FACILITY_ID].sort(),
    );
  });

  it('rejects a row whose name fails the contract without writing anything', async () => {
    const summary = await harness.importService.importCustomers(IMPORT_FACILITY_ID, 'name\n""');

    expect(summary.committed).toBe(0);
    expect(summary.rejected).toBe(1);
    expect(summary.results[0].errors?.[0]).toContain('Customer name is required');
    expect(await CustomerModel.countDocuments()).toBe(0);
  });
});
