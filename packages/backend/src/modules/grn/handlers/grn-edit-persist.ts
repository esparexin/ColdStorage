import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { BagType, CorrectGrnInput } from '@cold-storage/contracts';
import type { toGrnEntity } from '../grn.mappers.js';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';

interface PersistGrn {
  id: string;
  grnNumber: string;
  chamber: string;
  commodityId: string;
  date: Date;
}

interface PersistParams {
  session: mongoose.ClientSession;
  facilityId: string;
  grn: PersistGrn;
  update: Record<string, unknown>;
  inwardUpdate: Record<string, unknown>;
  finalBagType: BagType;
  finalSmallBags: number;
  finalBigBags: number;
  input: CorrectGrnInput;
  userId: string;
}

type LeanGrn = Parameters<typeof toGrnEntity>[0];

/** Applies descriptive (post-movement-safe) edits: chamber, gate pass, marks, vehicle, remarks. */
export function applyDescriptiveEdits(
  input: CorrectGrnInput,
  update: Record<string, unknown>,
  inwardUpdate: Record<string, unknown>,
): void {
  if (input.chamber !== undefined) {
    update.chamber = input.chamber.trim();
    inwardUpdate.chamber = input.chamber.trim();
  }
  if (input.gpNumber !== undefined) {
    update.gpNumber = input.gpNumber?.trim() || null;
  }
  if (input.storageMark !== undefined) {
    update.storageMark = input.storageMark?.trim() || null;
  }
  if (input.partyMark !== undefined) {
    update.partyMark = input.partyMark?.trim() || null;
  }
  if (input.marks !== undefined) {
    update.marks = input.marks?.trim() || null;
  }
  if (input.vehicleNumber !== undefined) {
    update.vehicleNumber = input.vehicleNumber?.trim().toUpperCase() || null;
  }
  if (input.remarks !== undefined) {
    update.remarks = input.remarks?.trim() || null;
  }
}

/**
 * Persists the correction and mirrors it to the inward ledger leg (creating a
 * backfill row for pre-ledger receipts), then propagates a chamber relabel to
 * every challan row that carries it so grouped reports cannot disagree.
 */
export async function persistCorrection(params: PersistParams): Promise<LeanGrn> {
  const { session, facilityId, grn, update, inwardUpdate } = params;
  const { finalBagType, finalSmallBags, finalBigBags, input, userId } = params;

  // Read back inside the transaction session; without it the response echoes pre-commit values.
  const updated = await GrnModel.findOneAndUpdate({ id: grn.id }, { $set: update }, { session, new: true })
    .lean()
    .exec();
  if (!updated) {
    throw new Error(`GRN '${grn.id}' not found in facility '${facilityId}'`);
  }

  if (Object.keys(inwardUpdate).length > 0) {
    const inwardResult = await InventoryTransactionModel.updateOne(
      { facilityId, grnId: grn.id, transactionType: 'INWARD_PUTAWAY' },
      { $set: inwardUpdate },
      { session },
    ).exec();

    if (inwardResult.matchedCount === 0) {
      // A receipt that predates the inward leg has no row to update; create it now
      // rather than leave the ledger disagreeing with the corrected receipt.
      await InventoryTransactionModel.create(
        [
          {
            id: `tx-${randomUUID()}`,
            facilityId,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            chamber:
              (inwardUpdate.chamber as string | undefined) ??
              (update.chamber as string | undefined) ??
              grn.chamber,
            commodityId:
              (inwardUpdate.commodityId as string | undefined) ??
              (update.commodityId as string | undefined) ??
              grn.commodityId,
            bagType: (inwardUpdate.bagType as BagType | undefined) ?? finalBagType,
            transactionType: 'INWARD_PUTAWAY' as const,
            smallQuantity:
              (inwardUpdate.smallQuantity as number | undefined) ?? finalSmallBags,
            bigQuantity: (inwardUpdate.bigQuantity as number | undefined) ?? finalBigBags,
            referenceType: 'PUT_AWAY' as const,
            referenceId: grn.id,
            notes: `Backfilled by correction of GRN '${grn.grnNumber}': ${input.reason.trim()}`,
            createdBy: userId,
            createdAt: (update.date as Date | undefined) ?? grn.date,
          },
        ],
        { session, ordered: true },
      );
    }
  }

  if (input.chamber !== undefined) {
    await DeliveryChallanModel.updateMany(
      { facilityId, grnId: grn.id },
      { $set: { chamber: (update.chamber as string) } },
      { session },
    ).exec();
  }

  return updated as unknown as LeanGrn;
}
