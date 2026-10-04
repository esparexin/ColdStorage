import mongoose from 'mongoose';
import { connectToDatabase, disconnectDatabase } from '../../database/connection.js';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { SystemSettingsModel } from '../../database/models/system-settings.model.js';
import { UserModel } from '../../database/models/user.model.js';
import { SEASONAL_MONTHS, seedCustomer, seedFacility, seedGrn } from './master-data-fixtures.js';

/**
 * Shared rent fixtures.
 *
 * Rent is a pure ledger concern keyed on a GRN, so a rent scenario needs no storage hierarchy:
 * the GRN carries a free-text `chamber` label and the seasonal rent term is always the fixed
 * 10-month period. These helpers are the single canonical way to seed that scenario, replacing
 * the per-file facility -> chamber -> rack -> level -> position fixture blocks.
 */

export const RENT_ORGANIZATION = {
  orgName: 'Sheetal Cold Storage Ltd',
  address: 'Plot 42, Cold Chain Zone, Nashik, MH',
  contact: '+91 98765 43210',
  gstin: '27AAAAA0000A1Z5',
  timezone: 'Asia/Kolkata',
  printFooter: 'Official Computer Generated Receipt.',
};

export interface RentScenario {
  facilityId: string;
  otherFacilityId: string;
  customerId: string;
  customerName: string;
  grnId: string;
  grnNumber: string;
  chamber: string;
  rentType: 'Monthly' | 'Seasonal';
  rentMonths: number;
  rentAmount: number;
}

export interface SeedRentScenarioOptions {
  facilityId?: string;
  otherFacilityId?: string;
  customerId?: string;
  customerName?: string;
  commodityName?: string;
  chamber?: string;
  grnNumber?: string;
  rentAmount?: number;
  rentType?: 'Monthly' | 'Seasonal';
}

/** Resolves once the suite has a live mongoose connection. */
export async function connectRentSuite(): Promise<void> {
  await connectToDatabase();
}

export async function disconnectRentSuite(): Promise<void> {
  await disconnectDatabase();
}

export interface RentResetScope {
  /** Facilities owned by the calling suite; nothing outside this list is ever purged. */
  facilityIds: string[];
  /** Accounts the calling suite mints; scoped so sibling suites keep theirs. */
  userIds?: string[];
}

/**
 * Clears only the rows the calling suite owns, never the whole collection.
 *
 * A blanket `deleteMany({})` on shared master data would purge other suites' fixtures while
 * they are mid-run. RentPayment and AuditLog are append-only by design, so those two are purged
 * through the raw collection driver to bypass the model-level immutability guards.
 */
export async function resetRentCollections(scope: RentResetScope): Promise<void> {
  const { facilityIds, userIds = [] } = scope;
  await FacilityModel.deleteMany({ id: { $in: facilityIds } });
  await CustomerModel.deleteMany({ facilityIds: { $in: facilityIds } });
  await GrnModel.deleteMany({ facilityId: { $in: facilityIds } });
  await CounterModel.deleteMany({ facilityId: { $in: facilityIds } });
  await UserModel.deleteMany({ id: { $in: userIds } });
  await mongoose.connection
    .collection('rentpayments')
    .deleteMany({ facilityId: { $in: facilityIds } });
  await mongoose.connection
    .collection('auditlogs')
    .deleteMany({ facilityId: { $in: facilityIds } });
}

/**
 * Organization identity is required before any official document (rent receipt) renders.
 * Upserted rather than created so a suite can re-establish it without owning the singleton.
 */
export async function seedOrganizationSettings(): Promise<void> {
  await SystemSettingsModel.findOneAndUpdate(
    { _id: 'SYSTEM_SETTINGS' },
    { $set: { ...RENT_ORGANIZATION, logoAssetId: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
}

/** Seeds organization settings, two facilities, a customer, and one GRN carrying a rent obligation. */
export async function seedRentScenario(
  options: SeedRentScenarioOptions = {},
): Promise<RentScenario> {
  const facilityId = options.facilityId ?? 'fac-rent-suite-1';
  const otherFacilityId = options.otherFacilityId ?? 'fac-rent-suite-2';
  const customerId = options.customerId ?? 'cust-rent-suite-1';
  const customerName = options.customerName ?? 'Ramesh Agro Traders';
  const chamber = options.chamber ?? 'CH-01';
  const rentType = options.rentType ?? 'Seasonal';
  const rentAmount = options.rentAmount ?? 5000;
  const grnNumber = options.grnNumber ?? 'GRN-26-27-0001';

  await seedOrganizationSettings();
  // `code` is left to the shared helper: Facility.code is unique, and deriving it from the
  // facility id keeps two rent suites that both use these defaults from colliding.
  await seedFacility({ id: facilityId, name: 'Cold Rent Test Facility' });
  await seedFacility({ id: otherFacilityId, name: 'Other Rent Facility' });
  await seedCustomer({ id: customerId, name: customerName, facilityId });

  const grnId = await seedGrn({
    facilityId,
    customerId,
    commodityId: 'cmd-rent-suite-1',
    commodityName: options.commodityName ?? 'Potatoes (Chipsona)',
    chamber,
    bags: 100,
    rentType,
    rentAmount,
    grnNumber,
  });

  return {
    facilityId,
    otherFacilityId,
    customerId,
    customerName,
    grnId,
    grnNumber,
    chamber,
    rentType,
    rentMonths: rentType === 'Seasonal' ? SEASONAL_MONTHS : 1,
    rentAmount,
  };
}
