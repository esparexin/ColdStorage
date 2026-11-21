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

import type { BagType, OutwardBagCategory, PaymentMode } from '@cold-storage/contracts';

export interface MergePayload {
  targetGrnId: string;
  sourceGrnIds: string[];
  movementDate: string;
  remarks: string;
  destinationChamber?: string;
  partyMark?: string;
  storageMark?: string;
  additionalRentAmount: number;
  isRepackSelected?: boolean;
  repackedSmallBags?: number;
  repackedBigBags?: number;
  repackedBagCount?: number;
  targetSmallBags?: number;
  targetBigBags?: number;
  targetBagCategory?: OutwardBagCategory | BagType;
  targetQuantity?: number;
  targetBagPrice?: number;
  targetSeasonalBagPrice?: number;
  targetMonthlyBagPrice?: number;
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

export {
  type TransferPayload,
  buildTransferPayload,
  validateTransferPayment,
} from './transferPayload.helper';

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
  destinationChamber?: string,
  targetSmallBags?: number,
  targetBigBags?: number,
  targetBagCategory?: OutwardBagCategory | BagType,
  targetQuantity?: number,
  targetBagPrice?: number,
  targetSeasonalBagPrice?: number,
  targetMonthlyBagPrice?: number,
  partyMark?: string,
  storageMark?: string,
): MergePayload {
  return {
    targetGrnId,
    sourceGrnIds,
    movementDate: movementDate || new Date().toISOString(),
    remarks: composeRemarks(reason, remarks),
    destinationChamber,
    partyMark: partyMark?.trim() || undefined,
    storageMark: storageMark?.trim() || undefined,
    additionalRentAmount: additionalRentAmount ?? 0,
    isRepackSelected,
    repackedSmallBags,
    repackedBigBags,
    repackedBagCount,
    targetSmallBags,
    targetBigBags,
    targetBagCategory,
    targetQuantity,
    targetBagPrice,
    targetSeasonalBagPrice,
    targetMonthlyBagPrice,
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

export function validateMergePaymentDecision(params: {
  decision: string;
  sourceCount?: number;
  amount: number;
  pending: number;
  paymentMode?: string;
}): string | null {
  const { decision, amount, pending, paymentMode } = params;
  if (pending <= 0 || decision === 'AGREED_PENDING') return null;
  if (decision !== 'SETTLE_NOW') return 'Invalid payment decision.';
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

