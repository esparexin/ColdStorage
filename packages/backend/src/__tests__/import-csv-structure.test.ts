import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerModel } from '../database/models/customer.model.js';
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

/**
 * Structural CSV guards for the import path.
 *
 * Every check here must fail before any domain work starts, so the suite asserts on thrown
 * canonical error codes rather than row-level summaries. `name` is now the only customer
 * column, which is what makes a header such as `name,mobile` an unknown-header failure.
 */
describe('ImportService — CSV structure guards', () => {
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

  it('pre-resolution failure guarantees 0 database queries and 0 database writes', async () => {
    const findSpy = vi.spyOn(mongoose.Model, 'find');
    const createSpy = vi.spyOn(mongoose.Model, 'create');

    await expect(
      harness.importService.importCustomers(IMPORT_FACILITY_ID, 'name\n"Unclosed quote'),
    ).rejects.toThrow('MALFORMED_CSV');

    expect(findSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(await CustomerModel.countDocuments()).toBe(0);

    findSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('rejects unmatched quotes with MALFORMED_CSV', async () => {
    await expect(
      harness.importService.importCustomers(IMPORT_FACILITY_ID, 'name\n"Alice'),
    ).rejects.toThrow('MALFORMED_CSV');
  });

  it('rejects duplicate column names', async () => {
    await expect(
      harness.importService.importCustomers(IMPORT_FACILITY_ID, 'name,name\nAlice,Alice'),
    ).rejects.toThrow('DUPLICATE_CSV_HEADERS');
  });

  it('rejects a file that omits the mandatory name column', async () => {
    await expect(
      harness.importService.importCustomers(IMPORT_FACILITY_ID, 'mobile\n9876543210'),
    ).rejects.toThrow('MISSING_CSV_HEADERS');
  });

  it('rejects the retired mobile/address/gstin columns as unknown headers', async () => {
    await expect(
      harness.importService.importCustomers(
        IMPORT_FACILITY_ID,
        'name,mobile,address,gstin\nAlice,9876543210,Plot 5,27AAAAA0000A1Z5',
      ),
    ).rejects.toThrow('UNKNOWN_CSV_HEADERS');
  });

  it('rejects a data row whose column count differs from the header', async () => {
    await expect(
      harness.importService.importCustomers(IMPORT_FACILITY_ID, 'name\nAlice,extraValue'),
    ).rejects.toThrow('INCONSISTENT_COLUMN_COUNT');
  });

  it('rejects a file with a header but no data rows', async () => {
    await expect(harness.importService.importCustomers(IMPORT_FACILITY_ID, 'name')).rejects.toThrow(
      'EMPTY_CSV_FILE',
    );
  });

  it('rejects 501 data rows before any domain execution', async () => {
    const lines = ['name'];
    for (let i = 1; i <= 501; i++) {
      lines.push(`Customer ${i}`);
    }

    await expect(
      harness.importService.importCustomers(IMPORT_FACILITY_ID, lines.join('\n')),
    ).rejects.toThrow('ROW_LIMIT_EXCEEDED');
    expect(await CustomerModel.countDocuments()).toBe(0);
  });

  it('applies the same structural guards to GRN uploads', async () => {
    // The retired `chamberNumber` column is rejected in favour of the free-text `chamber`.
    await expect(
      harness.importService.importGrns(
        IMPORT_FACILITY_ID,
        'grnNumber,date,customerName,commodityName,chamber,chamberNumber,bags,bagType,rentType,rentAmount',
        IMPORT_USER_ID,
      ),
    ).rejects.toThrow('UNKNOWN_CSV_HEADERS');

    await expect(
      harness.importService.importGrns(
        IMPORT_FACILITY_ID,
        'date,customerName,commodityName,bags,bagType,rentType,rentAmount',
        IMPORT_USER_ID,
      ),
    ).rejects.toThrow('MISSING_CSV_HEADERS');
  });
});
