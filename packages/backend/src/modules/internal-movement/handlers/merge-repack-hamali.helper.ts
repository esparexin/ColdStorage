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
  repackedSmallBags?: number | null;
  repackedBigBags?: number | null;
  totalMovedBags: number;
  session: mongoose.ClientSession;
}): Promise<RepackHamaliResolution> {
  const { commodityId, repackedSmallBags, repackedBigBags, totalMovedBags, session } = params;
  const isRepackingSelected = repackedSmallBags != null && repackedBigBags != null;
  if (!isRepackingSelected || totalMovedBags <= 0) {
    return { isRepackingSelected, repackHamaliBags: 0, repackHamaliRate: 0, repackHamaliCharge: 0 };
  }

  const commodity = await CommodityModel.findOne({ id: commodityId }, null, { session }).lean().exec();
  const isApplicable =
    commodity?.isHamaliApplicable !== undefined && commodity?.isHamaliApplicable !== null
      ? commodity.isHamaliApplicable
      : (commodity?.hamaliRate ?? 0) > 0;
  const rate = isApplicable ? (commodity?.hamaliRate ?? 0) : 0;
  const charge = rate > 0 ? calculateHamaliAmount(totalMovedBags, rate) : 0;

  return {
    isRepackingSelected,
    repackHamaliBags: totalMovedBags,
    repackHamaliRate: rate,
    repackHamaliCharge: charge,
  };
}
