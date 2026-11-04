import type mongoose from 'mongoose';
import { allocateHamaliShare, calculateHamaliAmount } from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { readLedgerNetDelivered } from '../../inventory/ledger-balance.js';
import { resolveEffectiveHamaliRate } from '../../common/hamali-resolution.js';

/**
 * Multi-season outward Hamali share (Multi-Season Hamali Accounting).
 *
 * Internal-only rent input: the full one-time amount derives from the GRN's
 * original inward intake bag count at the commodity rate. Each delivery takes
 * a capped pro-rata share. The original inward obligation is preserved across
 * seasonal renewals, and partial outward deliveries recover only the correct
 * remaining allocation without exceeding the original inward charge.
 */
export async function resolveFirstSeasonOutwardShare(input: {
  facilityId: string;
  grn: {
    id: string;
    bags: number;
    commodityId: string;
    commodityName: string;
    hamaliRate?: number | null;
    hamaliAmount?: number | null;
  };
  withdrawnTotal: number;
  expectedRentCharge: number;
  session: mongoose.ClientSession;
}): Promise<{ share: number; hamaliRate: number }> {
  const [commodity, netBefore] = await Promise.all([
    CommodityModel.findOne({ id: input.grn.commodityId }, null, { session: input.session }).lean().exec(),
    readLedgerNetDelivered(input.facilityId, input.grn.id, input.session),
  ]);
  const hamaliRate = resolveEffectiveHamaliRate(input.grn.hamaliRate, commodity);
  const full =
    input.grn.hamaliAmount != null && input.grn.hamaliAmount >= 0
      ? input.grn.hamaliAmount
      : calculateHamaliAmount(input.grn.bags, hamaliRate);
  if (full <= 0 || input.grn.bags <= 0) return { share: 0, hamaliRate };
  const obligationBags =
    hamaliRate > 0 && input.grn.hamaliAmount != null && input.grn.hamaliAmount > 0
      ? Math.round(input.grn.hamaliAmount / hamaliRate)
      : input.grn.bags;
  const prior = Number((full * (netBefore.total / obligationBags)).toFixed(2));
  const share = allocateHamaliShare(full, input.withdrawnTotal, obligationBags, prior);
  // Rent-vs-Hamali policy: while a share applies, the effective per-bag rent
  // must exceed the Hamali rate.
  if (share > 0 && input.withdrawnTotal > 0) {
    const perBagRent = Number((input.expectedRentCharge / input.withdrawnTotal).toFixed(2));
    if (!(perBagRent > hamaliRate)) {
      throw new Error(
        `Outward rent per bag (₹${perBagRent} for ${input.withdrawnTotal} bags) must exceed the Hamali rate of ₹${hamaliRate}/bag for commodity '${input.grn.commodityName}'`,
      );
    }
  }
  return { share, hamaliRate };
}
