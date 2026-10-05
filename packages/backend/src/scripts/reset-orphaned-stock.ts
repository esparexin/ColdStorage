/**
 * One-off pre-launch reset: remove specifically identified orphaned GRN(s) and their payments.
 *
 * An orphaned GRN is a receipt that predates the inward ledger leg: it has no inventory
 * transactions, no delivery challans and no delivery reversals referencing it. Once the ledger
 * is the balance authority such a receipt reads zero stock and fails reconciliation, so it must
 * be reset rather than migrated — there is no historical movement to backfill.
 *
 * This is NOT a generic production data-reset operation. It can only delete:
 *  1. GRNs that satisfy the orphan predicate below, AND are named explicitly, AND
 *  2. rent payments whose grnId is one of those deleted GRNs.
 * Customers, facilities, commodities and counters are never touched.
 *
 * Run with `npm run reset:orphaned-stock --workspace=@cold-storage/backend` from the repo root,
 * with MONGODB_URI pointing at the target database. Defaults to a DRY RUN: it prints the plan
 * and the exact documents and writes nothing unless --apply is passed.
 *
 * Four independent guards; any one aborts:
 *  1. No --apply                     → dry run, writes nothing.
 *  2. Target is `cold_storage`       → --apply requires --allow-live as well.
 *  3. No --confirm-grn-id            → nothing is deleted without naming exact ids.
 *  4. Pre-delete re-query drift      → the confirmed set is re-verified immediately before
 *     deleting; if it no longer matches the preview exactly, nothing is deleted.
 *
 * Rent payments are immutable through the Mongoose model by design, so deletions use the raw
 * driver collection with id-specific filters — the same pattern as the chamber migration. There
 * is no broad deleteMany anywhere in this script.
 *
 * Idempotent: re-running finds nothing left to do and exits cleanly.
 */
import mongoose from 'mongoose';
import { assertSafeDatabaseTarget } from '../database/connection.js';
import { logger } from '../utils/logger.js';

interface OrphanGrn {
  id: string;
  grnNumber: string;
  inwardReceiptNumber: string;
  date: Date;
  customerName: string;
  bags: number;
  rentAmount: number;
  paymentIds: string[];
}

function argValues(flag: string): string[] {
  const values: string[] = [];
  for (const arg of process.argv) {
    if (arg === flag || arg.startsWith(`${flag}=`)) {
      const raw = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : '';
      values.push(...raw.split(',').map((v) => v.trim()).filter(Boolean));
    }
  }
  return [...new Set(values)];
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const allowLive = process.argv.includes('--allow-live');
  const confirmedIds = argValues('--confirm-grn-id');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  assertSafeDatabaseTarget(uri);
  const withoutQuery = uri.split('?')[0];
  const targetDbName = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
  if (apply && targetDbName === 'cold_storage' && !allowLive) {
    throw new Error(
      'Refusing to apply the orphan reset to live database "cold_storage" without --allow-live. ' +
        'Verify the target, take a backup, then re-run with --apply --allow-live.',
    );
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  logger.info(`Connected to ${mongoose.connection.name}`);
  logger.info(apply ? 'MODE: APPLY (writes enabled)' : 'MODE: DRY RUN (pass --apply to write)');

  // ------------------------------------------------------------------ pre-flight
  const grns = await db.collection('grns').find({}).toArray();
  const orphans: OrphanGrn[] = [];
  const nonOrphans: string[] = [];

  for (const grn of grns) {
    const [txnCount, challanCount, reversalCount] = await Promise.all([
      db.collection('inventorytransactions').countDocuments({ grnId: grn.id }),
      db.collection('deliverychallans').countDocuments({ grnId: grn.id }),
      db.collection('deliveryreversals').countDocuments({ grnId: grn.id }),
    ]);
    if (txnCount + challanCount + reversalCount === 0) {
      const payments = await db
        .collection('rentpayments')
        .find({ grnId: grn.id }, { projection: { id: 1 } })
        .toArray();
      orphans.push({
        id: String(grn.id),
        grnNumber: String(grn.grnNumber),
        inwardReceiptNumber: String(grn.inwardReceiptNumber ?? '—'),
        date: grn.date as Date,
        customerName: String(grn.customerName),
        bags: Number(grn.bags),
        rentAmount: Number(grn.rentAmount ?? 0),
        paymentIds: payments.map((p) => String(p.id)),
      });
    } else {
      nonOrphans.push(String(grn.grnNumber));
    }
  }

  logger.info('\n--- Pre-flight ---');
  logger.info(`grns.total documents                 : ${grns.length}`);
  logger.info(`grns.orphaned (no movement at all)   : ${orphans.length}`);
  for (const o of orphans) {
    logger.info(
      `  - ${o.grnNumber} (id ${o.id}): ${o.bags} bags, rent ₹${o.rentAmount}, ` +
        `${o.paymentIds.length} payment(s) [${o.paymentIds.join(', ') || 'none'}]`,
    );
  }
  if (nonOrphans.length > 0) {
    logger.info(`grns.with movement (NEVER deletable)   : ${nonOrphans.join(', ')}`);
  }
  for (const name of ['customers', 'facilities', 'commodities', 'counters']) {
    const n = await db.collection(name).countDocuments({});
    logger.info(`${name} (left untouched)              : ${n}`);
  }

  if (!apply) {
    logger.info('\nDry run complete. Re-run with --apply to perform the reset.');
    return;
  }

  // ------------------------------------------------- guards 3 and 4: confirm, then re-verify
  if (confirmedIds.length === 0) {
    throw new Error(
      'Refusing to delete without --confirm-grn-id. Name every orphan id explicitly, ' +
        'e.g. --confirm-grn-id=grn-abc123.',
    );
  }
  const orphanIds = new Set(orphans.map((o) => o.id));
  const unconfirmed = confirmedIds.filter((id) => !orphanIds.has(id));
  if (unconfirmed.length > 0) {
    throw new Error(
      `Refusing to delete: these ids are not orphaned GRNs in the pre-flight above: ${unconfirmed.join(', ')}.`,
    );
  }

  const targets = orphans.filter((o) => confirmedIds.includes(o.id));
  for (const t of targets) {
    const [txnCount, challanCount, reversalCount] = await Promise.all([
      db.collection('inventorytransactions').countDocuments({ grnId: t.id }),
      db.collection('deliverychallans').countDocuments({ grnId: t.id }),
      db.collection('deliveryreversals').countDocuments({ grnId: t.id }),
    ]);
    if (txnCount + challanCount + reversalCount > 0) {
      throw new Error(
        `Aborting: GRN '${t.grnNumber}' gained movement since the pre-flight. Nothing was deleted.`,
      );
    }
  }

  // ------------------------------------------------------------------ delete by exact id only
  for (const t of targets) {
    const grnResult = await db.collection('grns').deleteOne({ id: t.id });
    for (const paymentId of t.paymentIds) {
      await db.collection('rentpayments').deleteOne({ id: paymentId });
    }
    logger.info(
      `Deleted GRN '${t.grnNumber}' (matched ${grnResult.deletedCount}) and ${t.paymentIds.length} payment(s).`,
    );
  }

  // ------------------------------------------------------------------ post-verify
  const [grnCount, txnCount, challanCount, paymentCount] = await Promise.all([
    db.collection('grns').countDocuments({}),
    db.collection('inventorytransactions').countDocuments({}),
    db.collection('deliverychallans').countDocuments({}),
    db.collection('rentpayments').countDocuments({}),
  ]);
  logger.info('\n--- Post-verify ---');
  logger.info(`grns=${grnCount} inventorytransactions=${txnCount} deliverychallans=${challanCount} rentpayments=${paymentCount}`);
  logger.info('\nOrphan reset complete.');
}

main()
  .catch((err: unknown) => {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    void mongoose.disconnect();
  });
