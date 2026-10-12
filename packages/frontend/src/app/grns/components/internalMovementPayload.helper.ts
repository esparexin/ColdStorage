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
): MergePayload {
  return {
    targetGrnId,
    sourceGrnIds,
    movementDate: movementDate || new Date().toISOString(),
    remarks: composeRemarks(reason, remarks),
    additionalRentAmount: additionalRentAmount ?? 0,
    repackedSmallBags,
    repackedBigBags,
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
