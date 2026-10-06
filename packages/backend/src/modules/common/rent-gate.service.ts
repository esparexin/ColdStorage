import type { ClientSession } from 'mongoose';
import { computeRentBalance, type RentBalance } from './rent-balance.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';
import { rentExtensionRepository } from '../rent/rent-extension.repository.js';

export type RentGateResult = RentBalance;

/**
 * Outward movement rent resolver.
 * Reuses the canonical rent ledger formula on the total due (original Seasonal
 * rent plus finalized January/February extensions): remaining = totalDue - paid.
 * Allows outward movement regardless of whether rent has been paid upfront,
 * returning the canonical balance so callers and ledgers preserve pending rent.
 */
export async function assertRentAllowedForOutward(
  facilityId: string,
  grn: { id: string; grnNumber: string; rentAmount: number },
  session?: ClientSession,
): Promise<RentGateResult> {
  const agg = await RentPaymentModel.aggregate([
    { $match: { facilityId, grnId: grn.id } },
    { $group: { _id: null, total: { $sum: '$amountPaid' } } },
  ]).session(session ?? null);

  const totalDue = await rentExtensionRepository.resolveTotalDue(
    facilityId,
    { id: grn.id, rentAmount: grn.rentAmount },
    session,
  );
  const balance = computeRentBalance(totalDue, agg[0]?.total ?? 0);

  return balance;
}
