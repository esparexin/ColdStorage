import mongoose from 'mongoose';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { PutAwayAllocationModel } from '../../database/models/put-away.model.js';

/**
 * Clears every collection the put-away / delivery suites write to.
 *
 * With the storage hierarchy gone there is nothing left to purge beyond the stock movement
 * documents themselves, so one call replaces the long per-file deleteMany chains. Accounts and
 * rent payments are deliberately untouched: they are immutable records seeded once per suite.
 */
export async function resetStockCollections(): Promise<void> {
  await FacilityModel.deleteMany({});
  await CustomerModel.deleteMany({});
  await CommodityModel.deleteMany({});
  await GrnModel.deleteMany({});
  await PutAwayAllocationModel.deleteMany({});
  await InventoryTransactionModel.deleteMany({});
  await DeliveryChallanModel.deleteMany({});
  await DeliveryReversalModel.deleteMany({});
  await CounterModel.deleteMany({});
}

/**
 * Stock suites run against their own database.
 *
 * Put-away and delivery suites assert on exact bag balances and ledger row counts, so they must
 * not share collections with suites that wipe master data mid-run. Pointing these suites at a
 * dedicated database keeps them deterministic even when other suites execute in parallel.
 */
const STOCK_SUITE_DB = 'cold_storage_stock_test';

function stockSuiteUri(): string {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
  const [withoutQuery, query] = uri.split('?');
  const lastSlash = withoutQuery.lastIndexOf('/');
  const server = lastSlash === -1 ? withoutQuery : withoutQuery.slice(0, lastSlash);
  return `${server}/${STOCK_SUITE_DB}${query ? `?${query}` : ''}`;
}

/** Resolves once the suite has a live mongoose connection, reusing an existing one if present. */
export async function connectToTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(stockSuiteUri());
  }
}
