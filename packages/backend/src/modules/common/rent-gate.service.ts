import type { ClientSession } from 'mongoose';
import { computeRentBalance, type RentBalance } from './rent-balance.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';
import { rentRepository } from '../rent/rent.repository.js';
import { rentExtensionRepository } from '../rent/rent-extension.repository.js';
import { computeFirstSeasonHamali } from './hamali-resolution.js';
import { CommodityModel } from '../../database/models/commodity.model.js';

export type RentGateResult = RentBalance;

/** The GRN shape this gate needs; rentType now participates in the base. */
export interface RentGateGrn {
  id: string;
  grnNumber: string;
  rentAmount: number | null;
  rentType: 'Monthly' | 'Seasonal' | 'Seasonal_3M';
  commodityId: string;
  bags: number;
}

/**
 * Outward movement rent resolver.
 *
 * The obligation is resolved through the rent-obligation SSOT
 * (`resolveTotalRentObligation` via the extension repository), so this gate can
 * no longer disagree with the rent summary, the payment collector, the storage
 * audit or the merge/transfer flows.
 *
 * Before W2 this passed only `{ id, rentAmount }`, so for a GRN whose rent is
 * carried on its outward challans (stored `rentAmount = 0`) it computed a
 * ZERO obligation. Production GRN 0015 is that shape: 422250 of outward rent
 * already collected, reported here as owing nothing, and the balance handed
 * back to the delivery ledger was materially wrong.
 */
export async function assertRentAllowedForOutward(
  facilityId: string,
  grn: RentGateGrn,
  session?: ClientSession,
): Promise<RentGateResult> {
  const agg = await RentPaymentModel.aggregate([
    { $match: { facilityId, grnId: grn.id } },
    { $group: { _id: null, total: { $sum: '$amountPaid' } } },
  ]).session(session ?? null);

  const [outwardRentCharges, extensions, commodity] = await Promise.all([
    rentRepository.getOutwardRentChargesForGrn(facilityId, grn.id, session),
    rentExtensionRepository.findExtensionsByGrn(facilityId, grn.id, session),
    CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec(),
  ]);

  // Hamali joins the total only when the base is the stored obligation; the
  // SSOT decides that, this only supplies the raw share.
  const hamaliShare =
    Number(grn.rentAmount ?? 0) > 0 ? computeFirstSeasonHamali(grn.bags, commodity, extensions) : 0;

  const totalDue = await rentExtensionRepository.resolveTotalDue(
    facilityId,
    {
      id: grn.id,
      rentAmount: grn.rentAmount,
      rentType: grn.rentType,
      outwardRentCharges,
      hamaliShare,
    },
    session,
  );
  const balance = computeRentBalance(totalDue, agg[0]?.total ?? 0);

  return balance;
}
