import type { ClientSession } from 'mongoose';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
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
  const [paymentAgg, outwardAgg] = await Promise.all([
    RentPaymentModel.aggregate([
      { $match: { facilityId, grnId: grn.id } },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } },
    ]).session(session ?? null),
    DeliveryChallanModel.aggregate([
      { $match: { facilityId, grnId: grn.id, status: 'ISSUED' } },
      { $group: { _id: null, total: { $sum: '$rentCharge' } } },
    ]).session(session ?? null),
  ]);

  const outwardRent = outwardAgg[0]?.total ?? 0;
  const baseRent = grn.rentAmount > 0 ? grn.rentAmount : outwardRent;

  const totalDue = await rentExtensionRepository.resolveTotalDue(
    facilityId,
    { id: grn.id, rentAmount: baseRent },
    session,
  );
  const balance = computeRentBalance(totalDue, paymentAgg[0]?.total ?? 0);

  return balance;
}
