/**
 * Forensic reconciliation script for GRN 0007:
 * Resolves repacked bag counts to the verified physical inventory of 140 bags (70 Small + 70 Big).
 *
 * Defaults to DRY RUN. Pass `--apply` to commit changes.
 */
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { connectToDatabase } from '../database/connection.js';
import { logger } from '../utils/logger.js';

async function main() {
  const isApply = process.argv.includes('--apply');
  logger.info(`Starting GRN 0007 reconciliation script [mode: ${isApply ? 'APPLY' : 'DRY RUN'}]...`);

  await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  const grn = await db.collection('grns').findOne({ grnNumber: '0007' });
  if (!grn) {
    logger.warn('GRN 0007 not found in database.');
    process.exit(0);
  }

  logger.info(`Found GRN 0007: current bags = ${grn.bags} (S: ${grn.smallBags}, B: ${grn.bigBags})`);

  const txs = await db.collection('inventorytransactions').find({ grnId: grn.id }).toArray();
  logger.info(`GRN 0007 transactions count = ${txs.length}:`);
  for (const t of txs) {
    logger.info(`  Tx: type=${t.transactionType}, S=${t.smallQuantity}, B=${t.bigQuantity}, notes="${t.notes}"`);
  }

  if (!isApply) {
    logger.info('DRY RUN preview:');
    logger.info('  Target GRN 0007 update: bags = 140, smallBags = 70, bigBags = 70, isCompositionVerified = true');
    logger.info('  InventoryTransaction adjustments: ensure pre-repack balance is adjusted out and repacked putaway reflects 140 bags (70 S, 70 B)');
    logger.info('Run with --apply to commit reconciliation.');
    process.exit(0);
  }

  // 1. Update GRN document
  await db.collection('grns').updateOne(
    { id: grn.id },
    {
      $set: {
        bags: 140,
        smallBags: 70,
        bigBags: 70,
        isCompositionVerified: true,
        updatedAt: new Date(),
      },
    },
  );
  logger.info('Updated GRN 0007: bags = 140 (70 Small + 70 Big).');

  // 2. Reconcile transactions:
  // If transactions already contain a 140-bag repacked putaway without outward adjustment:
  const repackedInward = txs.find(
    (t) => t.transactionType === 'INWARD_PUTAWAY' && (t.smallQuantity + t.bigQuantity === 140 || t.notes?.includes('repack')),
  );
  const existingRepackOut = txs.find(
    (t) => t.transactionType === 'OUTWARD_DELIVERY' && t.notes?.includes('repack'),
  );

  if (repackedInward && !existingRepackOut) {
    // Calculate exact pre-repack balance from all prior transactions
    const priorTxs = txs.filter((t) => t.id !== repackedInward.id);
    let preRepackSmall = 0;
    let preRepackBig = 0;
    for (const t of priorTxs) {
      const sign = t.transactionType === 'INWARD_PUTAWAY' ? 1 : -1;
      preRepackSmall += (t.smallQuantity ?? 0) * sign;
      preRepackBig += (t.bigQuantity ?? 0) * sign;
    }
    const preRepackTotal = preRepackSmall + preRepackBig;
    const movId = repackedInward.referenceId;
    await db.collection('inventorytransactions').insertOne({
      id: `tx-out-${randomUUID()}`,
      facilityId: grn.facilityId,
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      chamber: grn.chamber,
      commodityId: grn.commodityId,
      bagType: 'S/B',
      transactionType: 'OUTWARD_DELIVERY',
      smallQuantity: preRepackSmall,
      bigQuantity: preRepackBig,
      referenceType: 'DELIVERY',
      referenceId: movId,
      notes: `Stock adjustment for repacking (Lot ${grn.grnNumber})`,
      createdBy: grn.createdBy || 'system',
      createdAt: repackedInward.createdAt || new Date(),
    });
    logger.info(`Inserted missing pre-repack outward adjustment transaction (${preRepackTotal} bags: ${preRepackSmall} Small, ${preRepackBig} Big).`);
  }

  logger.info('GRN 0007 reconciliation completed successfully.');
  process.exit(0);
}

main().catch((err) => {
  logger.error('Error during reconciliation:', err);
  process.exit(1);
});

