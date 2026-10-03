import mongoose from 'mongoose';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { CustomerService } from '../../modules/customers/customer.service.js';
import { GrnService } from '../../modules/grn/grn.service.js';
import { ImportService } from '../../modules/import-export/import.service.js';
import { seedFacility } from './master-data-fixtures.js';

/**
 * Shared harness for the CSV import suites.
 *
 * The structural guards, the customer-import semantics and the GRN-import semantics are three
 * separate files; this keeps one canonical database reset, master-data seed and service
 * construction for all three instead of three copies of the same fixture block.
 */

export const IMPORT_FACILITY_ID = 'fac-import-csv';
export const IMPORT_OTHER_FACILITY_ID = 'fac-import-csv-other';
export const IMPORT_USER_ID = 'usr-import-csv';
export const IMPORT_COMMODITY_ID = 'cmd-import-potato';

export interface ImportHarness {
  importService: ImportService;
  grnService: GrnService;
  customerService: CustomerService;
}

export async function connectImportDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }
}

export async function disconnectImportDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/** Wipes every collection the import path can touch so each test starts from a known state. */
export async function resetImportDatabase(): Promise<void> {
  await FacilityModel.deleteMany({});
  await CommodityModel.deleteMany({});
  await CustomerModel.deleteMany({});
  await GrnModel.deleteMany({});
  await CounterModel.deleteMany({});
}

/** Two facilities plus one active commodity: the target tenant, a second tenant and a lookup key. */
export async function seedImportMasterData(): Promise<void> {
  await seedFacility({ id: IMPORT_FACILITY_ID, name: 'Central Cold Storage', code: 'IMPC' });
  await seedFacility({ id: IMPORT_OTHER_FACILITY_ID, name: 'North Cold Storage', code: 'IMPN' });
  await CommodityModel.findOneAndUpdate(
    { id: IMPORT_COMMODITY_ID },
    { $set: { name: 'Potato', normalizedName: 'potato', isActive: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
}

/** ImportService with its own service instances so spies never leak into other suites. */
export function createImportHarness(): ImportHarness {
  const grnService = new GrnService();
  const customerService = new CustomerService();
  return {
    grnService,
    customerService,
    importService: new ImportService(grnService, customerService),
  };
}
