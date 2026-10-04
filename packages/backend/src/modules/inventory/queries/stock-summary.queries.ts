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
export async function getAvailableComposition(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
  /**
   * The GRN's already-loaded inward bag composition. getGrnInventorySummary has it in hand, and
   * re-reading the same document here doubled the round trips.
   */
  known?: { bags: number; smallBags: number; bigBags: number },
): Promise<{ bags: number; smallBags: number; bigBags: number }> {
  const inward =
    known ??
    (
      await GrnModel.findOne({ id: grnId, facilityId }, { bags: 1, smallBags: 1, bigBags: 1 })
        .session(session ?? null)
        .lean()
        .exec()
    );
  if (inward === null || inward === undefined) {
    return { bags: 0, smallBags: 0, bigBags: 0 };
  }

  const issuedAgg = await DeliveryChallanModel.aggregate(
    [
      { $match: { facilityId, grnId, status: 'ISSUED' } },
      {
        $group: {
          _id: null,
          small: { $sum: '$smallBags' },
          big: { $sum: '$bigBags' },
        },
      },
    ],
    session ? { session } : {},
  );
  const smallBags = Math.max(0, inward.smallBags - (issuedAgg[0]?.small ?? 0));
  const bigBags = Math.max(0, inward.bigBags - (issuedAgg[0]?.big ?? 0));

  return { bags: smallBags + bigBags, smallBags, bigBags };
}


export async function getGrnInventorySummary(
  facilityId: string,
  grnId: string,
): Promise<GrnInventorySummary> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  const available = await getAvailableComposition(facilityId, grnId, undefined, grn);
  const putAwayStatus: PutAwayStatus = 'ALLOCATED';

  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    chamber: grn.chamber,
    totalBags: grn.bags,
    allocatedBags: available.bags,
    unallocatedBags: 0,
    putAwayStatus,
    availableSmallBags: available.smallBags,
    availableBigBags: available.bigBags,
  };
}
