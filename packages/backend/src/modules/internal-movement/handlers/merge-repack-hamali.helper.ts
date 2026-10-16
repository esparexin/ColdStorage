import type mongoose from 'mongoose';
import { calculateHamaliAmount } from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';

export interface RepackHamaliResolution {
  isRepackingSelected: boolean;
  repackHamaliBags: number;
  repackHamaliRate: number;
  repackHamaliCharge: number;
}

/**
 * Resolves one-time repacking hamali handling charge for explicit repacking during a merge.
 * Charges only explicitly confirmed repacked bags at the commodity-configured hamali rate.
 * Returns zero charge when repacking is not selected or hamali is not applicable.
 */
export async function resolveMergeRepackHamali(params: {
  commodityId: string;
  isRepackSelected?: boolean;
  repackedSmallBags?: number | null;
  repackedBigBags?: number | null;
  repackedBagCount?: number | null;
  totalMovedBags: number;
  session: mongoose.ClientSession;
}): Promise<RepackHamaliResolution> {
  const { commodityId, isRepackSelected, repackedSmallBags, repackedBigBags, repackedBagCount, totalMovedBags, session } = params;
  if (!isRepackSelected || totalMovedBags <= 0) {
    return { isRepackingSelected: false, repackHamaliBags: 0, repackHamaliRate: 0, repackHamaliCharge: 0 };
  }

  // Calculate actual bags handled
  const actualRepackedBags =
    repackedBagCount != null && repackedBagCount > 0
      ? Math.min(totalMovedBags, repackedBagCount)
      : typeof repackedSmallBags === 'number' && typeof repackedBigBags === 'number'
        ? Math.min(totalMovedBags, repackedSmallBags + repackedBigBags)
        : totalMovedBags;

  if (actualRepackedBags <= 0) {
    return { isRepackingSelected: true, repackHamaliBags: 0, repackHamaliRate: 0, repackHamaliCharge: 0 };
  }

  const commodity = await CommodityModel.findOne({ id: commodityId }, null, { session }).lean().exec();
  const isApplicable =
    commodity?.isHamaliApplicable !== undefined && commodity?.isHamaliApplicable !== null
      ? commodity.isHamaliApplicable
      : (commodity?.hamaliRate ?? 0) > 0;
  const rate = isApplicable ? (commodity?.hamaliRate ?? 0) : 0;
  const charge = rate > 0 ? calculateHamaliAmount(actualRepackedBags, rate) : 0;

  return {
    isRepackingSelected: true,
    repackHamaliBags: actualRepackedBags,
    repackHamaliRate: rate,
    repackHamaliCharge: charge,
  };
}
