/**
 * internalMovementPayload.helper — pure payload builders for the
 * InternalMovementModal POST bodies.
 *
 * The modal previously inlined both JSON bodies (and duplicated the
 * reason/remarks composition line in each handler) and omitted
 * `Content-Type: application/json`, so Express never parsed them and the
 * canonical zod contracts rejected every merge/transfer with
 * `targetGrnId/sourceGrnIds/remarks: Required`. Builders live here so the
 * exact wire shape is unit-testable against `@cold-storage/contracts`
 * without importing React/CSS.
 */

import type { BagType, OutwardBagCategory, PaymentMode, TransferPaymentDecision, TransferSettlementDetails } from '@cold-storage/contracts';

export interface MergePayload {
  targetGrnId: string;
  sourceGrnIds: string[];
  movementDate: string;
  remarks: string;
  additionalRentAmount: number;
  isRepackSelected?: boolean;
  repackedSmallBags?: number;
  repackedBigBags?: number;
  repackedBagCount?: number;
  // Source bag-type confirmation (outward vocabulary, informational for rent).
  sourceBagCategory?: OutwardBagCategory | BagType;
  sourceQuantity?: number;
  sourceBagPrice?: number;
  sourceSeasonalBagPrice?: number;
  sourceMonthlyBagPrice?: number;
  referenceWeight?: number;
  sourcePaymentAmount?: number;
  sourcePaymentMode?: PaymentMode;
}

export interface TransferPayload {
  grnId: string;
  newCustomerId: string;
  movementDate: string;
  remarks: string;
  paymentDecision?: TransferPaymentDecision;
  settlementDetails?: TransferSettlementDetails;
  confirmedSmallBags?: number;
  confirmedBigBags?: number;
  sourceBagType?: BagType;
  sourceBagCategory?: OutwardBagCategory | BagType;
  sourceQuantity?: number;
  sourceBagPrice?: number;
  sourceSeasonalBagPrice?: number;
  sourceMonthlyBagPrice?: number;
}

/** Single SSOT for the `reason. remarks` audit composition both flows share. */
function composeRemarks(reason: string, remarks?: string): string {
  return remarks?.trim() ? `${reason.trim()}. ${remarks.trim()}` : reason.trim();
}

export function buildMergePayload(
  targetGrnId: string,
  sourceGrnIds: string[],
  reason: string,
  remarks?: string,
  movementDate?: string,
  additionalRentAmount?: number,
  repackedSmallBags?: number,
  repackedBigBags?: number,
  referenceWeight?: number,
  sourcePaymentAmount?: number,
  sourcePaymentMode?: PaymentMode,
  sourceBagCategory?: OutwardBagCategory | BagType,
  sourceQuantity?: number,
  sourceBagPrice?: number,
  sourceSeasonalBagPrice?: number,
  sourceMonthlyBagPrice?: number,
  isRepackSelected?: boolean,
  repackedBagCount?: number,
): MergePayload {
  return {
    targetGrnId,
    sourceGrnIds,
    movementDate: movementDate || new Date().toISOString(),
    remarks: composeRemarks(reason, remarks),
    additionalRentAmount: additionalRentAmount ?? 0,
    isRepackSelected,
    repackedSmallBags,
    repackedBigBags,
    repackedBagCount,
    sourceBagCategory,
    sourceQuantity,
    sourceBagPrice,
    sourceSeasonalBagPrice,
    sourceMonthlyBagPrice,
    referenceWeight,
    sourcePaymentAmount,
    sourcePaymentMode,
  };
}

export function buildTransferPayload(
  grnId: string,
  newCustomerId: string,
  reason: string,
  remarks?: string,
  movementDate?: string,
  paymentDecision?: TransferPaymentDecision,
  settlementDetails?: TransferSettlementDetails,
  confirmation?: {
    confirmedSmallBags?: number;
    confirmedBigBags?: number;
    sourceBagCategory?: OutwardBagCategory | BagType;
    sourceQuantity?: number;
    sourceBagPrice?: number;
    sourceSeasonalBagPrice?: number;
    sourceMonthlyBagPrice?: number;
  },
): TransferPayload {
  return {
    grnId,
    newCustomerId,
    movementDate: movementDate || new Date().toISOString(),
    remarks: composeRemarks(reason, remarks),
    paymentDecision: paymentDecision || 'AGREED_PENDING',
    settlementDetails,
    confirmedSmallBags: confirmation?.confirmedSmallBags,
    confirmedBigBags: confirmation?.confirmedBigBags,
    sourceBagCategory: confirmation?.sourceBagCategory,
    sourceQuantity: confirmation?.sourceQuantity,
    sourceBagPrice: confirmation?.sourceBagPrice,
    sourceSeasonalBagPrice: confirmation?.sourceSeasonalBagPrice,
    sourceMonthlyBagPrice: confirmation?.sourceMonthlyBagPrice,
  };
}

export function validateTransferPayment(
  decision: string,
  amount: number,
  pending: number,
): string | null {
  if (pending <= 0) {
    return null;
  }
  if (decision === 'AGREED_PENDING') {
    return null;
  }
  if (decision !== 'SETTLE_NOW') {
    return 'Invalid payment decision.';
  }
  if (amount <= 0) {
    return 'Payment amount must be greater than zero.';
  }
  if (amount < pending) {
    return `Outstanding rent must be settled in full (₹${pending.toLocaleString('en-IN')}) before ownership transfer under SETTLE_NOW, or choose AGREED_PENDING to carry forward.`;
  }
  if (amount > pending) {
    return `Payment cannot exceed pending balance of ₹${pending.toLocaleString('en-IN')}.`;
  }
  return null;
}

export function validateMergePaymentDecision(params: {
  decision: string;
  sourceCount: number;
  amount: number;
  pending: number;
  paymentMode?: string;
}): string | null {
  const { decision, sourceCount, amount, pending, paymentMode } = params;
  if (pending <= 0 || decision === 'AGREED_PENDING') return null;
  if (decision !== 'SETTLE_NOW') return 'Invalid payment decision.';
  if (sourceCount > 1) {
    return 'Inline settlement requires a single source GRN. Choose Option A to carry forward.';
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return 'Enter a settlement amount greater than zero.';
  }
  if (amount > pending) {
    return `Settlement amount cannot exceed outstanding rent of ₹${pending.toLocaleString('en-IN')}.`;
  }
  if (!paymentMode) {
    return 'Please select a payment mode.';
  }
  return null;
}

