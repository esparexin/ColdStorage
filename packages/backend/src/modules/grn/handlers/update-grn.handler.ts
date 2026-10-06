import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { normalizeBagComposition, type CorrectGrnInput, type Grn } from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../grn.mappers.js';

interface CorrectionRecord {
  grnId: string;
  grnNumber: string;
  before: { commodityId: string; commodityName: string; bags: number; chamber: string };
  after: { commodityId: string; commodityName: string; bags: number; chamber: string };
  reason: string;
}

/**
 * Authorized correction of an inward receipt's operational facts.
 *
 * The architecture lock forbids silently editing confirmed transactions; any correction must go
 * through an approved workflow that leaves an audit trail. This is that workflow for the GRN.
 *
 * Two invariants govern what may change:
 * - The inward ledger leg is part of the receipt, not subsequent history, so a correction made
 *   before anything has moved updates the receipt and its inward row together, atomically.
 * - Once stock has moved, the receipt's bags and commodity are frozen: the ledger has already
 *   recorded them on outward and reversal events that must not be rewritten. Only the chamber
 *   label may still change, and it propagates to every row that carries it so grouped reports
 *   cannot disagree.
 */
export async function correctGrn(
  facilityId: string,
  grnId: string,
  input: CorrectGrnInput,
  userId: string,
): Promise<Grn> {
  const session = await mongoose.startSession();
  let corrected!: Grn;
  let record!: CorrectionRecord;

  try {
    await session.withTransaction(async () => {
      const grn = await GrnModel.findOneAndUpdate(
        { id: grnId, facilityId },
        { $set: { updatedAt: new Date() } },
        { session, new: true },
      )
        .lean()
        .exec();

      if (!grn) {
        throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
      }
      if (grn.status === 'CLOSED') {
        throw new Error(
          `GRN_CLOSED: Cannot correct GRN '${grn.grnNumber}': it is CLOSED and its stock has been fully delivered`,
        );
      }

      const activeChallans = await DeliveryChallanModel.countDocuments(
        { facilityId, grnId, status: 'ISSUED' },
        { session },
      ).exec();

      if (activeChallans > 0) {
        throw new Error(
          `GRN_ACTIVE_DELIVERY: Cannot correct GRN '${grn.grnNumber}': stock has already been delivered. Use the delivery reversal workflow instead.`,
        );
      }

      const [challanCount, reversalCount] = await Promise.all([
        DeliveryChallanModel.countDocuments({ facilityId, grnId }, { session }).exec(),
        DeliveryReversalModel.countDocuments({ facilityId, grnId }, { session }).exec(),
      ]);
      const hasMovement = challanCount + reversalCount > 0;

      const wantsBagsChange =
        input.bags !== undefined || input.smallBags !== undefined || input.bigBags !== undefined;
      const wantsCommodityChange = input.commodityId !== undefined;

      if (hasMovement && (wantsBagsChange || wantsCommodityChange)) {
        throw new Error(
          `GRN_MOVED: Cannot correct bags or commodity on GRN '${grn.grnNumber}': stock has already moved and ` +
            `the ledger has recorded the original figures. Only the chamber label may still be corrected.`,
        );
      }

      const before = {
        commodityId: grn.commodityId,
        commodityName: grn.commodityName,
        bags: grn.bags,
        chamber: grn.chamber,
      };

      const update: Record<string, unknown> = {};
      const inwardUpdate: Record<string, unknown> = {};

      if (wantsCommodityChange) {
        const commodity = await CommodityModel.findOne({ id: input.commodityId })
          .lean()
          .exec();
        if (!commodity) {
          throw new Error(`Commodity '${input.commodityId}' not found`);
        }
        if (!commodity.isActive) {
          throw new Error(`Commodity '${commodity.name}' is inactive`);
        }
        update.commodityId = commodity.id;
        update.commodityName = commodity.name;
        inwardUpdate.commodityId = commodity.id;
      }

      if (wantsBagsChange) {
        const finalBags = input.bags ?? grn.bags;
        // A single-type receipt's composition follows its bag type; a mixed receipt's corrected
        // split must sum to the corrected total. The shared rule rejects anything else.
        const composition = normalizeBagComposition({
          bagType: grn.bagType,
          bags: finalBags,
          smallBags: input.smallBags ?? (grn.bagType === 'S+B' ? grn.smallBags : undefined),
          bigBags: input.bigBags ?? (grn.bagType === 'S+B' ? grn.bigBags : undefined),
        });
        update.bags = finalBags;
        update.smallBags = composition.smallBags;
        update.bigBags = composition.bigBags;
        inwardUpdate.smallQuantity = composition.smallBags;
        inwardUpdate.bigQuantity = composition.bigBags;
        // Per-bag weights are independent of the bag count, so a corrected count
        // does not invalidate or recalculate any weight field.
      }

      if (input.chamber !== undefined) {
        update.chamber = input.chamber.trim();
        inwardUpdate.chamber = input.chamber.trim();
      }

      // Read the corrected state back inside the transaction session. Reading without the
      // session returns the pre-commit document, so the response would echo the old values
      // even though MongoDB persisted the correction.
      const updated = await GrnModel.findOneAndUpdate(
        { id: grn.id },
        { $set: update },
        { session, new: true },
      )
        .lean()
        .exec();

      if (Object.keys(inwardUpdate).length > 0) {
        const inwardResult = await InventoryTransactionModel.updateOne(
          { facilityId, grnId: grn.id, transactionType: 'INWARD_PUTAWAY' },
          { $set: inwardUpdate },
          { session },
        ).exec();

        if (inwardResult.matchedCount === 0) {
          // A receipt that predates the inward leg has no row to update. Its ledger balance
          // would otherwise disagree with the corrected receipt, so the leg is created now
          // rather than left missing.
          await InventoryTransactionModel.create(
            [
              {
                id: `tx-${randomUUID()}`,
                facilityId,
                grnId: grn.id,
                grnNumber: grn.grnNumber,
                chamber: (inwardUpdate.chamber as string | undefined) ?? grn.chamber,
                commodityId: (inwardUpdate.commodityId as string | undefined) ?? grn.commodityId,
                bagType: grn.bagType,
                transactionType: 'INWARD_PUTAWAY' as const,
                smallQuantity: (inwardUpdate.smallQuantity as number | undefined) ?? grn.smallBags,
                bigQuantity: (inwardUpdate.bigQuantity as number | undefined) ?? grn.bigBags,
                referenceType: 'PUT_AWAY' as const,
                referenceId: grn.id,
                notes: `Backfilled by correction of GRN '${grn.grnNumber}': ${input.reason.trim()}`,
                createdBy: userId,
                createdAt: grn.date,
              },
            ],
            { session, ordered: true },
          );
        }
      }

      if (input.chamber !== undefined) {
        // The chamber label denotes where the stock physically sits. Every row that carries it
        // moves with the correction, otherwise chamber-grouped reports disagree by source.
        await DeliveryChallanModel.updateMany(
          { facilityId, grnId: grn.id },
          { $set: { chamber: input.chamber.trim() } },
          { session },
        ).exec();
      }

      corrected = toGrnEntity(updated!);
      record = {
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        before,
        after: {
          commodityId: corrected.commodityId,
          commodityName: corrected.commodityName,
          bags: corrected.bags,
          chamber: corrected.chamber,
        },
        reason: input.reason,
      };
    });
  } finally {
    await session.endSession();
  }

  await auditService.log({
    eventType: 'GRN_CORRECTED',
    severity: 'WARN',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: record.grnId,
    details: {
      grnNumber: record.grnNumber,
      reason: record.reason,
      before: record.before,
      after: record.after,
    },
  });

  return corrected;
}
