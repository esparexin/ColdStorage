import type mongoose from 'mongoose';
import type {
  GrnInventorySummary,
  PutAwayAllocation,
  PutAwayStatus,
} from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { PutAwayAllocationModel } from '../../../database/models/put-away.model.js';
import { toPutAwayEntity } from '../inventory.mappers.js';
import { ledgerSignedQuantity } from '../ledger-polarity.js';

export async function listPutAwayAllocations(
  facilityId: string,
  grnId: string,
): Promise<PutAwayAllocation[]> {
  const docs = await PutAwayAllocationModel.find({ facilityId, grnId })
    .sort({ allocatedAt: -1 })
    .lean()
    .exec();
  return docs.map((d) => toPutAwayEntity(d));
}

/** Sums inward put-away bags for a GRN. Allocation is whole-lot, so this is all-or-nothing. */
export async function getAllocatedBags(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
): Promise<number> {
  const agg = await InventoryTransactionModel.aggregate(
    [
      { $match: { facilityId, grnId, transactionType: 'INWARD_PUTAWAY' } },
      { $group: { _id: null, bags: { $sum: '$quantity' } } },
    ],
    session ? { session } : {},
  );
  return agg[0]?.bags ?? 0;
}

/** Ledger-derived stock still on hand for a GRN after outward movement and reversals. */
export async function getAvailableBags(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
): Promise<number> {
  const agg = await InventoryTransactionModel.aggregate(
    [
      { $match: { facilityId, grnId } },
      { $group: { _id: null, bags: { $sum: ledgerSignedQuantity } } },
    ],
    session ? { session } : {},
  );
  return Math.max(0, agg[0]?.bags ?? 0);
}

export async function getGrnInventorySummary(
  facilityId: string,
  grnId: string,
): Promise<GrnInventorySummary> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  const allocatedBags = await getAllocatedBags(facilityId, grnId);
  const unallocatedBags = Math.max(0, grn.bags - allocatedBags);
  const putAwayStatus: PutAwayStatus = unallocatedBags === 0 ? 'ALLOCATED' : 'UNALLOCATED';

  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    chamber: grn.chamber,
    totalBags: grn.bags,
    allocatedBags,
    unallocatedBags,
    putAwayStatus,
  };
}
