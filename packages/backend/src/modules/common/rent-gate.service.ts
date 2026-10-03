import type { ClientSession } from 'mongoose';
import { computeRentBalance, type RentBalance } from './rent-balance.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';

export class RentPaymentRequiredError extends Error {
  public readonly statusCode = 402;
  public readonly code = 'RENT_PAYMENT_REQUIRED';
  public readonly grnId: string;
  public readonly grnNumber: string;
  public readonly rentAmount: number;
  public readonly totalPaid: number;
  public readonly remainingBalance: number;

  constructor(args: {
    grnId: string;
    grnNumber: string;
    rentAmount: number;
    totalPaid: number;
    remainingBalance: number;
  }) {
    super(
      `Rent payment required for GRN '${args.grnNumber}': paid ₹${args.totalPaid} of ₹${args.rentAmount}, remaining ₹${args.remainingBalance}. Complete rent payment before outward movement.`,
    );
    this.name = 'RentPaymentRequiredError';
    this.grnId = args.grnId;
    this.grnNumber = args.grnNumber;
    this.rentAmount = args.rentAmount;
    this.totalPaid = args.totalPaid;
    this.remainingBalance = args.remainingBalance;
  }
}

export type RentGateResult = RentBalance;

/**
 * Shared Inward → Rent gate for all outward movement (put-away + delivery).
 * Reuses the canonical rent ledger formula: remaining = rentAmount - sum(paid).
 * Hard-blocks only when nothing has been paid yet; partial payments proceed
 * so the caller can surface a warn-and-continue banner via GET /rent/grn/:id.
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

  const balance = computeRentBalance(grn.rentAmount, agg[0]?.total ?? 0);

  if (balance.rentAmount > 0 && balance.totalPaid === 0) {
    throw new RentPaymentRequiredError({
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      rentAmount: balance.rentAmount,
      totalPaid: balance.totalPaid,
      remainingBalance: balance.remainingBalance,
    });
  }

  return balance;
}
