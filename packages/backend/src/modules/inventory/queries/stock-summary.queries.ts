import type mongoose from 'mongoose';
import type { GrnInventorySummary } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { readLedgerBalance } from '../ledger-balance.js';

/**
 * Available bags still on hand for a GRN after outward movement and reversals.
 *
 * Read from the ledger, which carries the inward leg for every receipt. The `known` parameter
 * that used to skip re-reading the receipt is gone with the GRN-minus-challans formula it
 * served: re-reading the receipt to recompute what the ledger already states would be the
 * second formula again.
 */
export async function getAvailableComposition(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
): Promise<{ bags: number; smallBags: number; bigBags: number }> {
  const balance = await readLedgerBalance(facilityId, grnId, session);
  return { bags: balance.total, smallBags: balance.smallBags, bigBags: balance.bigBags };
}


export async function getGrnInventorySummary(
  facilityId: string,
  grnId: string,
): Promise<GrnInventorySummary> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  const available = await getAvailableComposition(facilityId, grnId);

  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    chamber: grn.chamber,
    totalBags: grn.bags,
    availableSmallBags: available.smallBags,
    availableBigBags: available.bigBags,
  };
}
