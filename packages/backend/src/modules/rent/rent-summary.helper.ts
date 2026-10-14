import {
  canCalculateAuthoritativeRent,
  resolveStoredCompositionVerified,
  splitRentObligation,
  type RentExtension,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import type { GrnDoc } from '../../database/models/grn.model.js';
import type { RentPaymentDoc } from '../../database/models/rent-payment.model.js';
import { computeRentBalance } from '../common/rent-balance.js';
import { toPaymentEntity } from './handlers/record-payment.handler.js';

/**
 * Maps a GRN and its payments to the canonical rent summary DTO.
 *
 * Shared by the single-GRN lookup and the batched facility list so both derive
 * the balance through computeRentBalance and cannot drift apart.
 *
 * The balance is always derived from the total due (original Seasonal
 * obligation plus finalized January/February extensions). With no extensions
 * the total due equals Grn.rentAmount exactly.
 *
 * Internal Hamali feeds the first-season total due only: callers pass the
 * precomputed `hamaliShare` (0 once a SEASON renewal is finalized). Hamali is
 * never stored on transaction records and never exposed in this DTO.
 *
 * If differential rates exist but bag quantities are unverified/unconfirmed,
 * historical rent calculation is marked PENDING_VERIFICATION rather than fabricating a bill.
 */
export function buildRentSummary(
  grn: GrnDoc,
  payments: RentPaymentDoc[],
  extensions: RentExtension[],
  deliveredBags = 0,
  remainingBags = grn.bags,
  outwardRentCharges = 0,
  hamaliShare = 0,
): RentSummaryDto {
  const { baseRent, total: totalDue } = splitRentObligation({
    rentType: grn.rentType,
    rentAmount: grn.rentAmount,
    outwardRentCharges,
    hamaliShare,
    extensionAmounts: extensions.map((e) => e.finalAmount),
  });

  const canCalc = canCalculateAuthoritativeRent({
    bagType: grn.bagType,
    bags: grn.bags,
    smallBags: grn.smallBags,
    bigBags: grn.bigBags,
    bagPrice: grn.bagPrice,
    smallBagPrice: grn.smallBagPrice,
    bigBagPrice: grn.bigBagPrice,
  });

  const storedVerified = resolveStoredCompositionVerified({
    isCompositionVerified: (grn as unknown as Record<string, unknown>).isCompositionVerified as boolean | null ?? null,
    bagType: grn.bagType,
    bags: grn.bags,
    smallBags: grn.smallBags,
    bigBags: grn.bigBags,
  });

  const isCompositionUnverified =
    baseRent === 0 && payments.length === 0 && (!storedVerified || !canCalc.canCalculate);
  const isLegacyUnverifiedHamali =
    grn.hamaliRate == null && grn.hamaliAmount == null && hamaliShare > 0 && payments.length === 0;
  const isPendingVerification = isCompositionUnverified || isLegacyUnverifiedHamali;
  const balance = computeRentBalance(
    totalDue,
    payments.reduce((sum, p) => sum + p.amountPaid, 0),
    { isPendingVerification },
  );

  return {
    grnId: grn.id,
    grnNumber: grn.grnNumber,
    facilityId: grn.facilityId,
    customerId: grn.customerId,
    customerName: grn.customerName,
    commodityName: grn.commodityName,
    chamber: grn.chamber,
    inwardDate: grn.date,
    totalBags: grn.bags,
    deliveredBags,
    remainingBags,
    bagPrice: grn.bagPrice ?? null,
    smallBagPrice: grn.smallBagPrice ?? null,
    bigBagPrice: grn.bigBagPrice ?? null,
    totalBagsWeight: grn.totalBagsWeight ?? null,
    rentType: grn.rentType,
    rentAmount: baseRent,
    rentMonths: grn.rentMonths ?? null,
    totalPaid: balance.totalPaid,
    remainingBalance: balance.remainingBalance,
    paymentStatus: balance.paymentStatus,
    rentState: balance.rentState,
    verificationReason: isPendingVerification
      ? !canCalc.canCalculate
        ? (canCalc.reason ?? 'Small and big bag composition unverified')
        : 'Legacy GRN has no stored Hamali rate snapshot; historical rate requires verification'
      : null,
    payments: payments.map((p) => toPaymentEntity(p)),
    extensions,
    totalDue: balance.rentAmount,
    remarks: grn.remarks ?? null,
  };
}
