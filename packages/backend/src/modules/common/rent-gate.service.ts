import type { ClientSession } from 'mongoose';
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

export interface RentGateResult {
  totalPaid: number;
  remainingBalance: number;
  paymentStatus: 'Settled' | 'Not Settled';
  isPartial: boolean;
}

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

  const totalPaid: number = agg[0]?.total ?? 0;
  const rentAmount = Number(grn.rentAmount ?? 0);
  const remainingBalance = Math.max(0, Number((rentAmount - totalPaid).toFixed(2)));
  const paymentStatus = remainingBalance === 0 ? 'Settled' : 'Not Settled';
  const isPartial = totalPaid > 0 && remainingBalance > 0;

  if (rentAmount > 0 && totalPaid === 0) {
    throw new RentPaymentRequiredError({
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      rentAmount,
      totalPaid,
      remainingBalance,
    });
  }

  return { totalPaid, remainingBalance, paymentStatus, isPartial };
}
