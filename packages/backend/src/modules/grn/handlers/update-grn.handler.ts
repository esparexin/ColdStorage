import mongoose from 'mongoose';
import type { CorrectGrnInput, Grn } from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { PutAwayAllocationModel } from '../../../database/models/put-away.model.js';
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
 * through an approved workflow that leaves an audit trail. This is that workflow for the GRN,
 * and it deliberately refuses to run once stock has moved: the ledger is immutable and has
 * already recorded the original commodity, bag count and chamber on its events, so rewriting
 * the receipt header would make the two disagree.
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
          `Cannot correct GRN '${grn.grnNumber}': it is CLOSED and its stock has been fully delivered`,
        );
      }

      const [putAways, movements, activeChallans] = await Promise.all([
        PutAwayAllocationModel.countDocuments({ facilityId, grnId }, { session }).exec(),
        InventoryTransactionModel.countDocuments(
          { facilityId, grnId, transactionType: { $ne: 'INWARD_PUTAWAY' } },
          { session },
        ).exec(),
        DeliveryChallanModel.countDocuments(
          { facilityId, grnId, status: 'ISSUED' },
          { session },
        ).exec(),
      ]);

      if (putAways > 0 || movements > 0 || activeChallans > 0) {
        throw new Error(
          `Cannot correct GRN '${grn.grnNumber}': stock has already been allocated or delivered. Use the delivery reversal workflow instead.`,
        );
      }

      const before = {
        commodityId: grn.commodityId,
        commodityName: grn.commodityName,
        bags: grn.bags,
        chamber: grn.chamber,
      };

      const update: Record<string, unknown> = {};

      if (input.commodityId !== undefined) {
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
      }

      if (input.bags !== undefined) {
        update.bags = input.bags;
        // Per-bag weights are independent of the bag count, so a corrected count
        // does not invalidate or recalculate any weight field.
      }

      if (input.chamber !== undefined) {
        update.chamber = input.chamber.trim();
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