#!/usr/bin/env node
/**
 * repair-monthly-rent.mjs
 *
 * Identifies Monthly GRNs with a synthesised non-zero rentAmount that should be
 * 0 (unconfigured), and optionally resets them.
 *
 * Usage:
 *   node scripts/repair-monthly-rent.mjs               # dry-run: audit only
 *   node scripts/repair-monthly-rent.mjs --commit       # apply the fix
 *   MONGODB_URI=mongodb://... node scripts/repair-monthly-rent.mjs --commit
 *
 * Safety:
 *   - Defaults to dry-run; the database is NEVER modified without --commit.
 *   - Only targets GRNs where:
 *       rentType === 'Monthly'
 *       rentAmount > 0          (synthesised fixed obligation)
 *       totalPaidAmount === 0   (no rent has been collected — safe to reset)
 *   - Prints every affected GRN before applying any change.
 *   - Returns exit code 1 if affected rows found in dry-run (useful in CI).
 */

import { MongoClient } from 'mongodb';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.join(repoRoot, '.env.local'), override: false });

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage';
const isDryRun = !process.argv.includes('--commit');

console.log('\n=== Monthly Rent Repair Script ===');
console.log('Mode   :', isDryRun ? 'DRY RUN (no writes)' : 'COMMIT MODE');
console.log('Target :', MONGO_URI.replace(/\/\/[^@]*@/, '//<credentials>@'), '\n');

const client = new MongoClient(MONGO_URI);

try {
  await client.connect();
  const db = client.db();
  const grns = db.collection('grns');
  const payments = db.collection('rentpayments');

  // 1. Find Monthly GRNs with a non-zero (synthetic) rentAmount.
  const candidates = await grns
    .find({ rentType: 'Monthly', rentAmount: { $gt: 0 } })
    .project({ id: 1, grnNumber: 1, facilityId: 1, rentAmount: 1, rentMonths: 1 })
    .toArray();

  if (candidates.length === 0) {
    console.log('No Monthly GRNs with non-zero rentAmount found. Nothing to repair.');
    await client.close();
    process.exit(0);
  }

  console.log(`Found ${candidates.length} Monthly GRN(s) with rentAmount > 0:\n`);

  const affected = [];

  for (const grn of candidates) {
    // 2. Only reset if zero payments have been collected — collected rent is immutable.
    const paymentSum = await payments
      .aggregate([
        { $match: { grnId: grn.id } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ])
      .toArray();
    const totalPaid = paymentSum[0]?.total ?? 0;
    const safeToReset = totalPaid === 0;

    const prefix = safeToReset ? '  [REPAIR]' : '  [SKIP]  ';
    const reason = safeToReset ? '' : ' -- payments exist, cannot safely reset';
    console.log(
      `${prefix} GRN ${grn.grnNumber} (${grn.id})` +
      ` | facility=${grn.facilityId}` +
      ` | rentAmount=Rs.${grn.rentAmount}` +
      ` | rentMonths=${grn.rentMonths ?? 'null'}` +
      ` | totalPaid=Rs.${totalPaid}` +
      reason
    );

    if (safeToReset) affected.push(grn);
  }

  console.log(`\nSafe to reset: ${affected.length} / ${candidates.length} GRN(s).`);

  if (affected.length === 0) {
    console.log('All affected GRNs have collected payments; no resets applied.');
    await client.close();
    process.exit(0);
  }

  if (isDryRun) {
    console.log('\nDRY RUN -- no changes written. Re-run with --commit to apply.\n');
    await client.close();
    process.exit(1);
  }

  // 3. Commit: reset rentAmount -> 0, rentMonths -> null for safe GRNs.
  const ids = affected.map((g) => g.id);
  const result = await grns.updateMany(
    { id: { $in: ids } },
    { $set: { rentAmount: 0, rentMonths: null } },
  );

  console.log(`\nRepaired ${result.modifiedCount} GRN(s): rentAmount -> 0, rentMonths -> null.`);
} finally {
  await client.close();
}
