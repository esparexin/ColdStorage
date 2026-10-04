import type mongoose from 'mongoose';
import type {
  GrnInventorySummary,
  PutAwayStatus,
} from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';

/**
 * Available bags still on hand for a GRN after outward movement and reversals.
 * Derived directly from authoritative GRN inward bags minus active delivery challans.
 */
export async function getAvailableBags(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
  /**
   * Inward bag count when the caller has already loaded the GRN. getGrnInventorySummary
   * has it in hand, and re-reading the same document here doubled the round trips.
   */
  knownBags?: number,
): Promise<number> {
  const inboundBags =
    knownBags ??
    (
      await GrnModel.findOne({ id: grnId, facilityId }, { bags: 1 })
        .session(session ?? null)
        .lean()
        .exec()
    )?.bags;
  if (inboundBags === undefined) return 0;

  const issuedAgg = await DeliveryChallanModel.aggregate(
    [
      { $match: { facilityId, grnId, status: 'ISSUED' } },
      { $group: { _id: null, bags: { $sum: '$bags' } } },
    ],
    session ? { session } : {},
  );
  const netDelivered = issuedAgg[0]?.bags ?? 0;
  return Math.max(0, inboundBags - netDelivered);
}


export async function getGrnInventorySummary(
  facilityId: string,
  grnId: string,
): Promise<GrnInventorySummary> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  const onHandBags = await getAvailableBags(facilityId, grnId, undefined, grn.bags);
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
