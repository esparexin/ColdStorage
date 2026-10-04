import mongoose from 'mongoose';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { SystemSettingsModel } from '../../database/models/system-settings.model.js';
import { seedChallan, seedCustomer, seedFacility, seedGrn } from './master-data-fixtures.js';

/**
 * Shared database fixtures for the P9 document route and service suites.
 *
 * Document rendering is a read-only composition layer: it joins SystemSettings, FacilityModel,
 * GrnModel and DeliveryChallanModel and writes nothing. Chamber is a free-text label and the
 * customer carries only a name, so a scenario is two facilities, one customer, one GRN and one
 * outward challan — no hierarchy to seed.
 */

/** A fully configured organization identity: without it every document render is refused. */
export const DOCUMENT_ORGANIZATION = {
  orgName: 'Himalayan Agri Cold Logistics Ltd',
  address: 'Fruit Mandi Complex, Shimla, Himachal Pradesh 171001',
  contact: '+91 177 2830000 | ops@himalayanagri.com',
  gstin: '02AAAAA0000A1Z5',
  logoAssetId: 'logo_himalayan_01.png',
  printFooter: 'This is a computer-generated official document. No manual signature needed.',
  timezone: 'Asia/Kolkata',
};

export async function connectDocumentDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }
}

export async function disconnectDocumentDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/**
 * Wipes every collection a document render reads. Accounts are deliberately untouched: the
 * suites mint their bearer tokens once in `beforeAll`, exactly like the other route suites.
 */
export async function resetDocumentCollections(): Promise<void> {
  await SystemSettingsModel.deleteMany({});
  await FacilityModel.deleteMany({});
  await CustomerModel.deleteMany({});
  await GrnModel.deleteMany({});
  await DeliveryChallanModel.deleteMany({});
  await CounterModel.deleteMany({});
}

/** Writes a complete organization identity so the ORGANIZATION_NOT_CONFIGURED guard stays open. */
export async function configureOrganization(): Promise<void> {
  await SystemSettingsModel.findOneAndUpdate(
    { _id: 'SYSTEM_SETTINGS' },
    { $set: { ...DOCUMENT_ORGANIZATION, updatedBy: 'usr-sa' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
}

/**
 * Creates the blank settings singleton an unconfigured administrator leaves behind. Depends on
 * `resetDocumentCollections` having cleared it, so `$setOnInsert` really does leave it blank.
 */
export async function ensureOrganizationUnconfigured(): Promise<void> {
  await SystemSettingsModel.findOneAndUpdate(
    { _id: 'SYSTEM_SETTINGS' },
    { $setOnInsert: { _id: 'SYSTEM_SETTINGS', orgName: '', address: '', contact: '' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
}

export interface DocumentScenario {
  facilityId: string;
  otherFacilityId: string;
  customerId: string;
  grnId: string;
  challanId: string;
}

export interface SeedDocumentScenarioOptions {
  facilityId: string;
  otherFacilityId: string;
  customerName?: string;
  grnNumber?: string;
  inwardReceiptNumber?: string;
  chamber?: string;
  bags?: number;
  challanNumber?: string;
}

/**
 * Two facilities, so a document can be requested under the wrong tenancy and be refused. Chamber
 * is a free-text label and the customer carries only a name, so there is nothing else to seed.
 */
export async function seedDocumentTenancy(
  facilityId: string,
  otherFacilityId: string,
): Promise<void> {
  await seedFacility({
    id: facilityId,
    name: 'Facility Alpha',
    code: 'FA',
    address: 'Plot 1, Zone A',
  });
  await seedFacility({
    id: otherFacilityId,
    name: 'Facility Beta',
    code: 'FB',
    address: 'Plot 2, Zone B',
  });
}

/**
 * The full rendering scenario: the tenancy plus one name-only customer, an inbound GRN and the
 * outward challan printed beside it.
 */
export async function seedDocumentScenario(
  options: SeedDocumentScenarioOptions,
): Promise<DocumentScenario> {
  const chamber = options.chamber ?? 'CH-01';
  const bags = options.bags ?? 100;
  const customerName = options.customerName ?? 'Balwinder Singh';

  await seedDocumentTenancy(options.facilityId, options.otherFacilityId);

  const customerId = await seedCustomer({ facilityId: options.facilityId, name: customerName });
  const grnId = await seedGrn({
    facilityId: options.facilityId,
    customerId,
    customerName,
    commodityName: 'Apple (Royal Delicious)',
    chamber,
    bags,
    bagType: 'B',
    bigBagWeight: 80,
    rentType: 'Monthly',
    rentMonths: 1,
    rentAmount: 20000,
    grnNumber: options.grnNumber ?? 'GRN-2026-0001',
    inwardReceiptNumber: options.inwardReceiptNumber ?? 'RCPT-2026-0001',
  });
  const challanId = await seedChallan({
    id: `chl-${options.facilityId}`,
    facilityId: options.facilityId,
    challanNumber: options.challanNumber ?? 'CHL-2026-0001',
    grnId,
    customerId,
    customerName,
    commodityName: 'Apple (Royal Delicious)',
    chamber,
    bags: Math.floor(bags / 5),
    vehicleNumber: 'PB-01-AA-1122',
    driverName: 'Gurdeep Singh',
    issuedBy: 'Operator',
  });

  return {
    facilityId: options.facilityId,
    otherFacilityId: options.otherFacilityId,
    customerId,
    grnId,
    challanId,
  };
}
