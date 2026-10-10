import type mongoose from 'mongoose';
import {
  calculateRentAmount,
  deriveBagPrice,
  rentMonthsForType,
  SEASONAL_RENT_MONTHS,
  type BagType,
  type CorrectGrnInput,
  type RentType,
} from '@cold-storage/contracts';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { commodityRateService } from '../../commodities/commodity-rate.service.js';

export interface StoredRentState {
  commodityId: string;
  rentType: RentType;
  rentMonths: number | null;
  rentAmount: number;
  bagPrice: number | null;
  smallBagPrice: number | null;
  bigBagPrice: number | null;
}

interface ResolveRentEditParams {
  facilityId: string;
  grnId: string;
  grnNumber: string;
  grn: StoredRentState;
  /** Post-edit commodity (input override or stored). Compared for B7 switches. */
  finalCommodityId: string;
  input: CorrectGrnInput;
  finalBags: number;
  finalBagType: BagType;
  finalSmallBags: number;
  finalBigBags: number;
  bagsChanged: boolean;
  session: mongoose.ClientSession;
}

export function wantsRentChange(input: CorrectGrnInput, bagsChanged: boolean): boolean {
  return (
    input.rentType !== undefined ||
    input.rentMonths !== undefined ||
    input.rentAmount !== undefined ||
    input.bagPrice !== undefined ||
    input.smallBagPrice !== undefined ||
    input.bigBagPrice !== undefined ||
    // Commodity switches route through rent resolution so carried-forward rates
    // re-validate against the new commodity (B7); amounts are preserved as-is.
    input.commodityId !== undefined ||
    bagsChanged
  );
}

/**
 * Resolves a rent/pricing edit into stored fields.
 *
 * Quantity or pricing moves without an explicit rentAmount override re-derive the
 * obligation from the canonical pricing SSOT so the per-bag rate cannot silently
 * drift. Collected payments are immutable: the obligation can grow but never shrink
 * below what has already been paid.
 */
export async function resolveRentEdit(
  params: ResolveRentEditParams,
): Promise<Record<string, unknown>> {
  const { facilityId, grnId, grnNumber, grn, input } = params;
  const { finalBags, finalBagType, finalSmallBags, finalBigBags, bagsChanged, session } = params;

  const finalRentType = input.rentType ?? grn.rentType;
  let finalRentMonths: number | null;
  if (finalRentType === 'Seasonal') {
    finalRentMonths = SEASONAL_RENT_MONTHS;
  } else if (input.rentMonths !== undefined) {
    finalRentMonths = input.rentMonths ?? null;
  } else {
    finalRentMonths = grn.rentMonths ?? null;
  }
  if (finalRentType === 'Monthly' && finalRentMonths != null && finalRentMonths < 1) {
    throw new Error(`rentMonths must be >= 1 for 'Monthly' rent`);
  }

  const finalBagPrice = input.bagPrice !== undefined ? (input.bagPrice ?? null) : grn.bagPrice;
  const finalSmallBagPrice =
    input.smallBagPrice !== undefined ? (input.smallBagPrice ?? null) : grn.smallBagPrice;
  const finalBigBagPrice =
    input.bigBagPrice !== undefined ? (input.bigBagPrice ?? null) : grn.bigBagPrice;

  let finalRentAmount: number;
  if (input.rentAmount !== undefined && input.rentAmount != null) {
    finalRentAmount = input.rentAmount;
  } else if (
    finalRentType === 'Monthly' &&
    (input.rentAmount === null ||
      (input.rentAmount === undefined && (grn.rentAmount === 0 || finalRentMonths == null)))
  ) {
    finalRentAmount = 0;
  } else if (
    input.bagPrice !== undefined ||
    input.smallBagPrice !== undefined ||
    input.bigBagPrice !== undefined ||
    input.rentType !== undefined ||
    input.rentMonths !== undefined ||
    bagsChanged
  ) {
    finalRentAmount = calculateRentAmount({
      rentType: finalRentType,
      bags: finalBags,
      bagType: finalBagType,
      bagPrice: finalBagPrice,
      smallBags: finalSmallBags,
      bigBags: finalBigBags,
      smallBagPrice: finalSmallBagPrice,
      bigBagPrice: finalBigBagPrice,
      rentMonths: finalRentMonths,
      rentAmount: grn.rentAmount,
    });
  } else {
    finalRentAmount = grn.rentAmount;
  }

  // Correction-path controller enforcement (B5–B7): any touched rate field or
  // agreement switch re-validates against the final commodity/rentType with
  // fail-closed omission. Untouched history is never checked. Explicit lump
  // sums must equal the SSOT derivation from the final agreed rates.
  const ratesTouched =
    input.smallBagPrice !== undefined ||
    input.bigBagPrice !== undefined ||
    input.bagPrice !== undefined ||
    input.rentAmount !== undefined;
  const agreementSwitched =
    params.finalCommodityId !== grn.commodityId || finalRentType !== grn.rentType;
  if (ratesTouched || agreementSwitched) {
    await commodityRateService.validateSubmittedRates(
      params.finalCommodityId,
      finalRentType,
      {
        bagType: finalBagType,
        smallBagPrice: finalSmallBagPrice,
        bigBagPrice: finalBigBagPrice,
        bagPrice: finalBagPrice,
        rentAmount: input.rentAmount,
        bags: finalBags,
        smallBags: finalSmallBags,
        bigBags: finalBigBags,
        rentMonths: finalRentMonths,
      },
      { requireRates: true },
    );
  }

  const payments = await RentPaymentModel.find({ facilityId, grnId }, null, { session })
    .lean()
    .exec();
  const totalPaid = payments.reduce((sum, p) => sum + (p.amountPaid ?? 0), 0);
  if (finalRentAmount < totalPaid) {
    throw new Error(
      `GRN_RENT_PAID: Cannot reduce rent to ₹${finalRentAmount} on GRN '${grnNumber}': ₹${totalPaid} has already been collected`,
    );
  }

  const update: Record<string, unknown> = {
    rentType: finalRentType,
    rentAmount: finalRentAmount,
    bagPrice:
      finalBagPrice ??
      deriveBagPrice({
        rentType: finalRentType,
        bags: finalBags,
        rentMonths: finalRentMonths,
        rentAmount: finalRentAmount,
      }),
    smallBagPrice: finalSmallBagPrice,
    bigBagPrice: finalBigBagPrice,
  };
  update.rentMonths =
    finalRentType === 'Seasonal' ? rentMonthsForType(finalRentType) : finalRentMonths;
  return update;
}
