import { expect } from 'vitest';
import mongoose from 'mongoose';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CommodityRateModel } from '../../database/models/commodity-rate.model.js';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { resetStockCollections } from './stock-reset.js';

/**
 * Canonical lifecycle test isolation (Phase 0 harness).
 * Clears stock AND financial collections so extension/payment/movement
 * state can never leak between tests. Replaces ad-hoc deleteMany chains.
 */
export async function resetAllFinancialCollections(): Promise<void> {
  await resetStockCollections();
  await CommodityRateModel.deleteMany({});
  // Raw-driver deletes: RentPayment (and siblings) carry immutability
  // pre-hooks that prohibit Model.deleteMany even in tests.
  await mongoose.connection.collection('rentpayments').deleteMany({});
  await mongoose.connection.collection('rentextensions').deleteMany({});
  await mongoose.connection.collection('internalmovements').deleteMany({});
}

export async function assertCollectionsEmpty(): Promise<void> {
  for (const [name, model] of [
    ['grn', GrnModel], ['inventory', InventoryTransactionModel],
    ['challan', DeliveryChallanModel], ['reversal', DeliveryReversalModel],
    ['rates', CommodityRateModel],
  ] as const) {
    expect(await model.countDocuments({}), `${name} not empty`).toBe(0);
  }
  for (const name of ['rentpayments', 'rentextensions', 'internalmovements']) {
    expect(await mongoose.connection.collection(name).countDocuments({}), `${name} not empty`).toBe(0);
  }
}

export interface TestCommoditySpec {
  id: string;
  name: string;
  seasonDuration?: 'Seasonal' | 'Seasonal_3M';
  hamaliApplicable?: boolean;
  hamaliRate?: number;
  seasonal?: { small: number; big: number };
  monthly?: { small: number; big: number };
}

/** Mandatory commodity factory: no fictional commodityIds in lifecycle tests. */
export async function seedCommodityWithRates(spec: TestCommoditySpec): Promise<string> {
  await CommodityModel.create({
    id: spec.id, name: spec.name, normalizedName: spec.name.toLowerCase(),
    isActive: true, seasonDuration: spec.seasonDuration ?? 'Seasonal',
    isHamaliApplicable: spec.hamaliApplicable ?? false, hamaliRate: spec.hamaliRate ?? 0,
  });
  if (spec.seasonal) {
    await CommodityRateModel.create({ id: `crt-${spec.id}-s`, commodityId: spec.id, rentType: 'Seasonal', smallRate: spec.seasonal.small, bigRate: spec.seasonal.big, isActive: true });
  }
  if (spec.monthly) {
    await CommodityRateModel.create({ id: `crt-${spec.id}-m`, commodityId: spec.id, rentType: 'Monthly', smallRate: spec.monthly.small, bigRate: spec.monthly.big, isActive: true });
  }
  return spec.id;
}

export interface PersistedGrnExpectation {
  bags?: number; smallBags?: number; bigBags?: number;
  rentAmount?: number; status?: string; hamaliRate?: number; hamaliAmount?: number;
}

/** Triple-assert leg 1: persisted GRN receipt fields (never response echo alone). */
export async function assertPersistedGrnState(grnId: string, expected: PersistedGrnExpectation): Promise<void> {
  const doc = await GrnModel.findOne({ id: grnId }).lean().exec();
  expect(doc, `GRN ${grnId} missing`).toBeTruthy();
  for (const [key, value] of Object.entries(expected)) {
    expect((doc as Record<string, unknown>)[key], `GRN field ${key}`).toBe(value);
  }
}

export interface LedgerExpectation { inward?: number; outward?: number; reversal?: number }

/** Triple-assert leg 2: ledger rows conserve per movement type. */
export async function assertLedgerConserves(facilityId: string, grnId: string, expected: LedgerExpectation): Promise<void> {
  const rows = await InventoryTransactionModel.find({ facilityId, grnId }).lean().exec();
  const sum = (type: string) => rows.filter((r) => r.transactionType === type)
    .reduce((s, r) => s + r.smallQuantity + r.bigQuantity, 0);
  if (expected.inward !== undefined) expect(sum('INWARD_PUTAWAY'), 'inward total').toBe(expected.inward);
  if (expected.outward !== undefined) expect(sum('OUTWARD_DELIVERY'), 'outward total').toBe(expected.outward);
  if (expected.reversal !== undefined) expect(sum('DELIVERY_REVERSAL'), 'reversal total').toBe(expected.reversal);
}

/** Frozen boundary dates: Monthly/3M/season/FY edges must use these, never wall clock. */
export const BoundaryDates = {
  seasonStart: '2026-03-01', seasonEnd: '2026-12-31',
  janMid: '2026-01-15', febEnd: '2026-02-28',
  monthEnd31: '2026-01-31', monthEndClamp: '2026-02-28',
  fyRolloverBefore: '2026-03-31', fyRolloverAfter: '2026-04-01',
  m3BoundaryIn: '2026-06-01', m3Month3: '2026-09-01', m3Month4: '2026-10-02',
} as const;

export { mongoose, FacilityModel, CustomerModel, CounterModel };
