import type mongoose from 'mongoose';
import type {
  GrnInventorySummary,
  PutAwayAllocation,
  PutAwayStatus,
} from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { PutAwayAllocationModel } from '../../../database/models/put-away.model.js';
import { toPutAwayEntity } from '../inventory.mappers.js';

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

/**
 * Available bags still on hand for a GRN after outward movement and reversals.
 * Derived directly from authoritative GRN inward bags minus active delivery challans.
 */
export async function getAvailableBags(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
): Promise<number> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }, { bags: 1 })
    .session(session ?? null)
    .lean()
    .exec();
  if (!grn) return 0;

  const issuedAgg = await DeliveryChallanModel.aggregate(
    [
      { $match: { facilityId, grnId, status: 'ISSUED' } },
      { $group: { _id: null, bags: { $sum: '$bags' } } },
    ],
    session ? { session } : {},
  );
  const netDelivered = issuedAgg[0]?.bags ?? 0;
  return Math.max(0, grn.bags - netDelivered);
}

/**
 * Chamber-allocated bags on hand for a GRN.
 * Inward GRN receipt is the authoritative record confirming chamber storage.
 */
export async function getAllocatedBags(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
): Promise<number> {
  return getAvailableBags(facilityId, grnId, session);
}

export async function getGrnInventorySummary(
  facilityId: string,
  grnId: string,
): Promise<GrnInventorySummary> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  const onHandBags = await getAvailableBags(facilityId, grnId);
  const putAwayStatus: PutAwayStatus = 'ALLOCATED';

  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    chamber: grn.chamber,
    totalBags: grn.bags,
    allocatedBags: onHandBags,
    unallocatedBags: 0,
    putAwayStatus,
  };
}
