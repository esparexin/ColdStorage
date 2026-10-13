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

import type { PaymentMode, TransferPaymentDecision, TransferSettlementDetails } from '@cold-storage/contracts';

export interface MergePayload {
  targetGrnId: string;
  sourceGrnIds: string[];
  movementDate: string;
  remarks: string;
  additionalRentAmount: number;
  repackedSmallBags?: number;
  repackedBigBags?: number;
  hamaliBags?: number;
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
  hamaliBags?: number,
): MergePayload {
  return {
    targetGrnId,
    sourceGrnIds,
    movementDate: movementDate || new Date().toISOString(),
    remarks: composeRemarks(reason, remarks),
    additionalRentAmount: additionalRentAmount ?? 0,
    repackedSmallBags,
    repackedBigBags,
    hamaliBags,
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
): TransferPayload {
  return {
    grnId,
    newCustomerId,
    movementDate: movementDate || new Date().toISOString(),
    remarks: composeRemarks(reason, remarks),
    paymentDecision: paymentDecision || 'AGREED_PENDING',
    settlementDetails,
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
  if (decision !== 'SETTLE_NOW') {
    return `Cannot transfer ownership: Outstanding rent of ₹${pending.toLocaleString('en-IN')} must be fully settled before transfer.`;
  }
  if (amount <= 0) {
    return 'Payment amount must be greater than zero.';
  }
  if (amount < pending) {
    return `Outstanding rent must be settled in full (₹${pending.toLocaleString('en-IN')}) before ownership transfer.`;
  }
  if (amount > pending) {
    return `Payment cannot exceed pending balance of ₹${pending.toLocaleString('en-IN')}.`;
  }
  return null;
}
