import mongoose, { ConnectionStates } from 'mongoose';
import { assertSafeDatabaseTarget } from '../../database/connection.js';
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

export function stockSuiteUri(): string {
  // Test isolation: never inherit a live Atlas server. Prefer the explicit
  // test override, otherwise use localhost. The live `cold_storage` database
  // (Atlas or local) is never a valid stock-suite target.
  const candidate =
    process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
  const [withoutQuery, query] = candidate.split('?');
  const lastSlash = withoutQuery.lastIndexOf('/');
  const server = lastSlash === -1 ? withoutQuery : withoutQuery.slice(0, lastSlash);
  const resolved = `${server}/${STOCK_SUITE_DB}${query ? `?${query}` : ''}`;
  assertSafeDatabaseTarget(resolved);
  return resolved;
}

/**
 * Resolves once the suite has a live mongoose connection.
 *
 * `mongoose` is a module singleton, so every test file in the worker shares ONE connection.
 * A previous file's `afterAll` teardown can therefore still be closing that connection when the
 * next file's `beforeAll` runs. The old `readyState === 0` guard read `1` (connected) during
 * that window, skipped connecting, and the suite then queried a dying socket — surfacing as an
 * intermittent "GRN not found" in whichever suite happened to run next.
 *
 * Awaiting `asPromise()` settles any in-flight connect/close, and re-checking after the await
 * makes the connect idempotent under concurrency.
 */
let connectOnce: Promise<void> | null = null;

/**
 * Reads the live connection state.
 *
 * Read through a function so TypeScript cannot narrow it across the awaits below: the state
 * genuinely can change while awaiting, and narrowing would hide that from the compiler.
 */
const connectionState = (): ConnectionStates => mongoose.connection.readyState;

export async function connectToTestDatabase(): Promise<void> {
  const target = stockSuiteUri();
  assertSafeDatabaseTarget(target);
  if (connectionState() === ConnectionStates.connected) {
    if (mongoose.connection.name === 'cold_storage') {
      await mongoose.disconnect();
      throw new Error(
        'FATAL SAFETY VIOLATION: Active connection is pointing to live database "cold_storage" during test execution.',
      );
    }
    return;
  }

  connectOnce ??= mongoose.connect(target).then(() => undefined);
  try {
    await connectOnce;
  } finally {
    connectOnce = null;
  }

  // Settle any close that a previous suite kicked off before deciding we are still connected.
  if (connectionState() !== ConnectionStates.connected) {
    await mongoose.connection.asPromise();
  }

  if (mongoose.connection.name === 'cold_storage') {
    await mongoose.disconnect();
    throw new Error(
      'FATAL SAFETY VIOLATION: Test process connected to live database "cold_storage". Aborting to prevent data corruption.',
    );
  }
}

/**
 * No-op teardown for suites on the shared connection.
 *
 * Disconnecting here would tear down the connection the next suite depends on. The vitest
 * worker closes it when the process exits.
 */
export async function disconnectTestDatabase(): Promise<void> {
  // Intentionally empty — see the note above.
}
