/**
 * Forensic reconciliation script for historical GRN bag types & verification status.
 *
 * Reconciles historical GRN documents in MongoDB with their authoritative
 * Stock Movement History (InternalMovementRecord) and inward declarations.
 *
 * Conforms strictly to @cold-storage/contracts SSOT.
 *
 * Defaults to DRY RUN. Pass `--apply` to commit changes to MongoDB.
 */
import mongoose from 'mongoose';
import { isHybridBagCategory } from '@cold-storage/contracts';
import { connectToDatabase } from '../database/connection.js';
import { logger } from '../utils/logger.js';

interface ReconciliationPlan {
  grnId: string;
  grnNumber: string;
  customerName: string;
  status: string;
  current: {
    bagType: string | null;
    smallBags: number | null;
    bigBags: number | null;
    isCompositionVerified: boolean | null;
  };
  proposed: {
    bagType: string;
    smallBags: number;
    bigBags: number;
    isCompositionVerified: boolean;
  };
  reason: string;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  logger.info(`Starting Historical GRN Bag Type Reconciliation [mode: ${isApply ? 'APPLY' : 'DRY RUN'}]...`);

  await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  const allGrns = await db.collection('grns').find({}).toArray();
  const movements = await db.collection('internalmovements').find({}).toArray();

  const plans: ReconciliationPlan[] = [];

  for (const grn of allGrns) {
    // 1. Merged / Closed lots with destination or movement history
    if (grn.status === 'CLOSED' && (grn.mergedIntoGrnNumber || grn.mergedIntoGrnId)) {
      if (grn.isCompositionVerified !== true) {
        // Find movement matching this source GRN
        const move = movements.find(
          (m) =>
            (Array.isArray(m.sourceGrnNumbers) && m.sourceGrnNumbers.includes(grn.grnNumber)) ||
            (Array.isArray(m.sourceGrnIds) && m.sourceGrnIds.includes(grn.id)),
        );

        const destGrn = allGrns.find(
          (g) => g.grnNumber === grn.mergedIntoGrnNumber || (grn.mergedIntoGrnId && g.id === grn.mergedIntoGrnId),
        );

        let resolvedType: string = 'S/B';
        if (move?.resultingBagType) {
          resolvedType = move.resultingBagType;
        } else if (move?.sourceBagType) {
          resolvedType = move.sourceBagType;
        } else if (destGrn?.bagType) {
          resolvedType = destGrn.bagType;
        } else if (grn.bagType && grn.bagType !== 'S/B') {
          resolvedType = grn.bagType;
        }

        const isHybrid = resolvedType === 'Hybrid' || isHybridBagCategory(resolvedType);
        const smallBags = isHybrid ? 0 : (grn.smallBags ?? 0);
        const bigBags = isHybrid ? 0 : (grn.bigBags ?? 0);

        plans.push({
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          customerName: grn.customerName || 'N/A',
          status: grn.status,
          current: {
            bagType: grn.bagType ?? null,
            smallBags: grn.smallBags ?? null,
            bigBags: grn.bigBags ?? null,
            isCompositionVerified: grn.isCompositionVerified ?? null,
          },
          proposed: {
            bagType: resolvedType,
            smallBags,
            bigBags,
            isCompositionVerified: true,
          },
          reason: `Merged into GRN ${grn.mergedIntoGrnNumber}: resolved from stock movement ledger`,
        });
      }
      continue;
    }

    // 2. Pure single-type Small lots (e.g. GRN 0008, 0011)
    if (grn.bagType === 'S' && grn.smallBags === grn.bags && (!grn.bigBags || grn.bigBags === 0)) {
      if (grn.isCompositionVerified !== true) {
        plans.push({
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          customerName: grn.customerName || 'N/A',
          status: grn.status,
          current: {
            bagType: grn.bagType,
            smallBags: grn.smallBags,
            bigBags: grn.bigBags,
            isCompositionVerified: grn.isCompositionVerified,
          },
          proposed: {
            bagType: 'S',
            smallBags: grn.smallBags,
            bigBags: 0,
            isCompositionVerified: true,
          },
          reason: 'Inward declared as Small (S) with verified bag count matching total bags',
        });
      }
      continue;
    }

    // 3. Pure single-type Big lots
    if (grn.bagType === 'B' && grn.bigBags === grn.bags && (!grn.smallBags || grn.smallBags === 0)) {
      if (grn.isCompositionVerified !== true) {
        plans.push({
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          customerName: grn.customerName || 'N/A',
          status: grn.status,
          current: {
            bagType: grn.bagType,
            smallBags: grn.smallBags,
            bigBags: grn.bigBags,
            isCompositionVerified: grn.isCompositionVerified,
          },
          proposed: {
            bagType: 'B',
            smallBags: 0,
            bigBags: grn.bigBags,
            isCompositionVerified: true,
          },
          reason: 'Inward declared as Big (B) with verified bag count matching total bags',
        });
      }
      continue;
    }

    // 4. Hybrid lots with leftover S/B counts (e.g. Lot 5000)
    if (
      (grn.bagType === 'Hybrid' || isHybridBagCategory(grn.bagType)) &&
      (grn.smallBags !== 0 || grn.bigBags !== 0 || grn.isCompositionVerified !== true)
    ) {
      plans.push({
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        customerName: grn.customerName || 'N/A',
        status: grn.status,
        current: {
          bagType: grn.bagType,
          smallBags: grn.smallBags,
          bigBags: grn.bigBags,
          isCompositionVerified: grn.isCompositionVerified,
        },
        proposed: {
          bagType: 'Hybrid',
          smallBags: 0,
          bigBags: 0,
          isCompositionVerified: true,
        },
        reason: 'Hybrid consignment normalized (smallBags=0, bigBags=0, verified=true)',
      });
      continue;
    }
  }

  logger.info(`Found ${plans.length} GRNs requiring bag type reconciliation.`);

  if (!isApply) {
    logger.info('============================= DRY RUN PREVIEW =============================');
    for (const p of plans) {
      logger.info(
        `GRN ${p.grnNumber.padEnd(5)} | ${p.customerName.padEnd(25)} | Current: bagType=${p.current.bagType ?? 'null'}, S=${p.current.smallBags ?? 0}, B=${p.current.bigBags ?? 0}, verified=${p.current.isCompositionVerified} -> Proposed: bagType=${p.proposed.bagType}, S=${p.proposed.smallBags}, B=${p.proposed.bigBags}, verified=${p.proposed.isCompositionVerified} (${p.reason})`,
      );
    }
    logger.info('===========================================================================');
    logger.info('DRY RUN completed. No changes written to database.');
    logger.info('To apply these changes, run with: npm run reconcile:historical-bags');
    await mongoose.disconnect();
    process.exit(0);
  }

  // APPLY MODE
  logger.info(`Applying updates to ${plans.length} GRNs...`);
  let updatedCount = 0;

  for (const p of plans) {
    await db.collection('grns').updateOne(
      { id: p.grnId },
      {
        $set: {
          bagType: p.proposed.bagType,
          smallBags: p.proposed.smallBags,
          bigBags: p.proposed.bigBags,
          isCompositionVerified: p.proposed.isCompositionVerified,
          updatedAt: new Date(),
        },
      },
    );
    updatedCount++;
    logger.info(`Updated GRN ${p.grnNumber}: bagType=${p.proposed.bagType}, verified=true.`);
  }

  logger.info(`Reconciliation successfully applied to ${updatedCount} GRNs.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error('Reconciliation failed:', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
