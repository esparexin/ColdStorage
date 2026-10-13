import type mongoose from 'mongoose';
import { allocateHamaliShare, calculateHamaliAmount, isFirstSeasonExtensions } from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { readLedgerNetDelivered } from '../../inventory/ledger-balance.js';
import { resolveEffectiveHamaliRate } from '../../common/hamali-resolution.js';

/**
 * First-season outward Hamali share (feat/hamali-first-season-internal).
 *
 * Internal-only rent input: the full one-time amount derives from the GRN's
 * original inward bag count at the live commodity rate, and each delivery
 * takes a capped pro-rata share (R1). Zero once a SEASON renewal is finalized
 * (R2). Nothing is stored on the challan or GRN; the share joins the delivery
 * rent charge. The rent-extension repository is lazy-loaded to preserve the
 * delivery→rent decoupling (F10b precedent).
 */
export async function resolveFirstSeasonOutwardShare(input: {
  facilityId: string;
  grn: { id: string; bags: number; commodityId: string; commodityName: string };
  withdrawnTotal: number;
  expectedRentCharge: number;
  session: mongoose.ClientSession;
}): Promise<{ share: number; hamaliRate: number }> {
  const { rentExtensionRepository } = await import('../../rent/rent-extension.repository.js');
  const [commodity, extensions, netBefore] = await Promise.all([
    CommodityModel.findOne({ id: input.grn.commodityId }, null, { session: input.session }).lean().exec(),
    rentExtensionRepository.findExtensionsByGrn(input.facilityId, input.grn.id, input.session),
    readLedgerNetDelivered(input.facilityId, input.grn.id, input.session),
  ]);
  const hamaliRate = resolveEffectiveHamaliRate(undefined, commodity);
  const full = calculateHamaliAmount(input.grn.bags, hamaliRate);
  if (full <= 0 || input.grn.bags <= 0) return { share: 0, hamaliRate };
  if (!isFirstSeasonExtensions(extensions)) return { share: 0, hamaliRate };
  const prior = Number((full * (netBefore.total / input.grn.bags)).toFixed(2));
  const share = allocateHamaliShare(full, input.withdrawnTotal, input.grn.bags, prior);
  // Rent-vs-Hamali policy: while a share applies, the effective per-bag rent
  // must exceed the Hamali rate. Post-renewal (share 0) is unaffected.
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
