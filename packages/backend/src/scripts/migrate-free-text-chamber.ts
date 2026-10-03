/**
 * One-off data migration: free-text chamber + name-only customer.
 *
 * Run with `npm run migrate:free-text-chamber --workspace=@cold-storage/backend` from the repo
 * root, with MONGODB_URI pointing at the target database. Defaults to a DRY RUN: it prints the
 * plan and the affected row counts and writes nothing unless --apply is passed.
 *
 * Why this is needed
 * ------------------
 * 1. Chamber. GRNs, delivery challans, put-away allocations and the inventory ledger stored
 *    `chamberId` + `chamberNumber` and now store a single free-text `chamber` (max 20 chars).
 *    `chamberNumber` is the operator-facing label, so it is the value carried over.
 * 2. Customer.mobile. The field was `required` with a UNIQUE index. It is now absent from the
 *    schema, so every new customer document omits it — which means MongoDB indexes the missing
 *    value identically for all of them and the unique index rejects the second insert with a
 *    duplicate-key error. The index MUST be dropped before customers can be created again.
 *    This is the single highest-risk step in the change; verify the counts below first.
 *
 * Ordering: run this AFTER the new application code is deployed, because the new code reads
 * `chamber` and ignores `chamberId`/`chamberNumber` (it does not read them at all, so the two
 * releases are safe to overlap in either order). The old code, however, reads `chamberId`, so
 * do not roll back to the previous release after running this without first restoring the
 * fields from a backup.
 *
 * Idempotent: re-running finds nothing left to do and exits cleanly.
 */
import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const CHAMBER_COLLECTIONS = [
  'grns',
  'deliverychallans',
  'putawayallocations',
  'inventorytransactions',
] as const;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(uri);
  logger.info(`Connected to ${mongoose.connection.name}`);
  logger.info(apply ? 'MODE: APPLY (writes enabled)' : 'MODE: DRY RUN (pass --apply to write)');

  // ---------------------------------------------------------------- pre-flight
  const preflight: Record<string, number> = {};
  for (const name of CHAMBER_COLLECTIONS) {
    const exists = (await mongoose.connection.db!.listCollections({ name }).toArray()).length > 0;
    preflight[name] = exists
      ? await mongoose.connection.db!.collection(name).countDocuments({
          chamber: { $exists: false },
          chamberNumber: { $exists: true },
        })
      : 0;
  }

  const customersNeedingBackfill = await mongoose.connection.db!
    .collection('customers')
    .countDocuments({ name: { $exists: true } });

  const indexes = await mongoose.connection.db!
    .collection('customers')
    .indexes()
    .catch(() => [] as Array<{ name: string }>);
  const mobileIndex = indexes.find((i) => i.name === 'mobile_1');

  logger.info('\n--- Pre-flight ---');
  logger.info(`customers.total documents        : ${customersNeedingBackfill}`);
  logger.info(`customers mobile_1 unique index   : ${mobileIndex ? 'PRESENT' : 'absent'}`);
  for (const [name, count] of Object.entries(preflight)) {
    logger.info(`${name}.documents needing chamber backfill: ${count}`);
  }

  if (customersNeedingBackfill > 0 && !mobileIndex) {
    logger.info('\nNote: customers exist but mobile_1 is already absent — nothing to drop.');
  }
  if (customersNeedingBackfill === 0) {
    logger.info('\nNote: the customers collection is empty, so dropping mobile_1 is trivial.');
  }

  if (!apply) {
    logger.info('\nDry run complete. Re-run with --apply to perform the migration.');
    return;
  }

  // ------------------------------------------------- 1. drop the unique mobile index
  if (mobileIndex) {
    await mongoose.connection.db!.collection('customers').dropIndex('mobile_1');
    logger.info('\nDropped customers.mobile_1 unique index.');
  }

  // --------------------------------------- 2. backfill chamber, then drop old fields
  for (const name of CHAMBER_COLLECTIONS) {
    const exists = (await mongoose.connection.db!.listCollections({ name }).toArray()).length > 0;
    if (!exists) {
      logger.info(`${name}: collection absent, skipped.`);
      continue;
    }
    const col = mongoose.connection.db!.collection(name);

    const backfilled = await col.updateMany(
      { chamber: { $exists: false }, chamberNumber: { $exists: true } },
      [{ $set: { chamber: { $ifNull: ['$chamberNumber', ''] } } }],
    );

    // Only unset once every row carries a non-empty chamber, so no document is ever left
    // without one. Rows with a blank chamberNumber are left untouched for manual review.
    const stillMissing = await col.countDocuments({
      $or: [{ chamber: { $exists: false } }, { chamber: '' }],
    });
    if (stillMissing > 0) {
      logger.info(
        `${name}: backfilled ${backfilled.modifiedCount}, but ${stillMissing} rows still lack a chamber — old fields KEPT for manual review.`,
      );
      continue;
    }

    await col.updateMany({}, { $unset: { chamberId: '', chamberNumber: '', rackId: '', levelId: '', positionId: '', positionCode: '' } });
    logger.info(`${name}: backfilled ${backfilled.modifiedCount}, old hierarchy fields unset.`);
  }

  // ------------------------------------ 3. customer: legacy columns left inert in place
  // `mobile`/`address`/`gstin` are simply no longer read or written. They are left in the
  // documents rather than unset so a rollback to the previous release still has them.
  logger.info(
    '\nCustomer mobile/address/gstin values are left in place (inert). Unset them only if you\n' +
      'are certain you will never roll back to a release that reads them.',
  );

  logger.info('\nMigration complete.');
}

main()
  .catch((err: unknown) => {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    void mongoose.disconnect();
  });