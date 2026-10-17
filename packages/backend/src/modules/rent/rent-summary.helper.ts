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
/**
 * Resolves the actual timestamp when the rent obligation or bill was generated.
 * Uses existing persisted billing records and timestamps (GRN creation for upfront stored rent,
 * delivery challan creation for outward rent, extension finalization for extensions).
 * Does NOT substitute inward date, outward date, movement date, or current date.
 * If historical records lack a reliable persisted generation timestamp, returns null (renders '—').
 */
export function resolveRentGeneratedDate(params: {
  grnRentAmount: number | null | undefined;
  grnCreatedAt: Date | string | null | undefined;
  outwardRentCharges: number;
  earliestOutwardCreatedAt: Date | string | null | undefined;
  extensions?: Array<{ finalizedAt?: Date | string | null; createdAt?: Date | string | null }>;
}): Date | null {
  const {
    grnRentAmount,
    grnCreatedAt,
    outwardRentCharges,
    earliestOutwardCreatedAt,
    extensions = [],
  } = params;

  if (grnRentAmount != null && grnRentAmount > 0 && grnCreatedAt) {
    const d = new Date(grnCreatedAt);
    if (!isNaN(d.getTime())) return d;
  }

  if (outwardRentCharges > 0 && earliestOutwardCreatedAt) {
    const d = new Date(earliestOutwardCreatedAt);
    if (!isNaN(d.getTime())) return d;
  }

  if (extensions.length > 0) {
    for (const ext of extensions) {
      const extDate = ext.finalizedAt ?? ext.createdAt;
      if (extDate) {
        const d = new Date(extDate);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }

  return null;
}

export function buildRentSummary(
  grn: GrnDoc,
  payments: RentPaymentDoc[],
  extensions: RentExtension[],
  deliveredBags = 0,
  remainingBags = grn.bags,
  outwardRentCharges = 0,
  hamaliShare = 0,
  earliestOutwardCreatedAt?: Date | null,
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
  const isMergedSource = Boolean(grn.mergedIntoGrnId);
  const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  const effectiveTotalDue = totalPaid > totalDue ? totalPaid : totalDue;
  const effectiveBaseRent = totalPaid > baseRent && baseRent === totalDue ? totalPaid : baseRent;
  const balance = computeRentBalance(
    effectiveTotalDue,
    totalPaid,
    { isPendingVerification },
  );

  // When a GRN was merged into another GRN, its unpaid obligation was carried forward to
  // the target GRN. To prevent duplicate billing, double-counting in facility metrics,
  // and duplicate collection, its remainingBalance on the source GRN is 0 and status is Settled.
  const remainingBalance = isMergedSource ? 0 : balance.remainingBalance;
  const paymentStatus = isMergedSource ? 'Settled' : balance.paymentStatus;
  const rentState = isMergedSource ? 'SETTLED' : balance.rentState;

  const rentGeneratedDate = resolveRentGeneratedDate({
    grnRentAmount: grn.rentAmount,
    grnCreatedAt: grn.createdAt,
    outwardRentCharges,
    earliestOutwardCreatedAt,
    extensions,
  });

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
    rentAmount: effectiveBaseRent,
    rentMonths: grn.rentMonths ?? null,
    totalPaid: balance.totalPaid,
    remainingBalance,
    paymentStatus,
    rentState,
    verificationReason: isPendingVerification
      ? !canCalc.canCalculate
        ? (canCalc.reason ?? 'Small and big bag composition unverified')
        : 'Legacy GRN has no stored Hamali rate snapshot; historical rate requires verification'
      : null,
    payments: payments.map((p) => toPaymentEntity(p)),
    extensions,
    totalDue: balance.rentAmount,
    remarks: grn.remarks ?? null,
    rentGeneratedDate,
    mergedIntoGrnId: grn.mergedIntoGrnId ?? null,
    mergedIntoGrnNumber: grn.mergedIntoGrnNumber ?? null,
  };
}
