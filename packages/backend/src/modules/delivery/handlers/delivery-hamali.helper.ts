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
  grn: { id: string; bags: number; commodityId: string };
  withdrawnTotal: number;
  session: mongoose.ClientSession;
}): Promise<number> {
  const { rentExtensionRepository } = await import('../../rent/rent-extension.repository.js');
  const [commodity, extensions, netBefore] = await Promise.all([
    CommodityModel.findOne({ id: input.grn.commodityId }, null, { session: input.session }).lean().exec(),
    rentExtensionRepository.findExtensionsByGrn(input.facilityId, input.grn.id, input.session),
    readLedgerNetDelivered(input.facilityId, input.grn.id, input.session),
  ]);
  const full = calculateHamaliAmount(
    input.grn.bags,
    resolveEffectiveHamaliRate(undefined, commodity),
  );
  if (full <= 0 || input.grn.bags <= 0) return 0;
  if (!isFirstSeasonExtensions(extensions)) return 0;
  const prior = Number((full * (netBefore.total / input.grn.bags)).toFixed(2));
  return allocateHamaliShare(full, input.withdrawnTotal, input.grn.bags, prior);
}
