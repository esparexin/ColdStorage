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

export interface MergePayload {
  targetGrnId: string;
  sourceGrnIds: string[];
  movementDate: string;
  remarks: string;
  additionalRentAmount: number;
}

export interface TransferPayload {
  grnId: string;
  newCustomerId: string;
  movementDate: string;
  remarks: string;
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
): MergePayload {
  return {
    targetGrnId,
    sourceGrnIds,
    movementDate: movementDate || new Date().toISOString(),
    remarks: composeRemarks(reason, remarks),
    additionalRentAmount: 0,
  };
}

export function buildTransferPayload(
  grnId: string,
  newCustomerId: string,
  reason: string,
  remarks?: string,
  movementDate?: string,
): TransferPayload {
  return {
    grnId,
    newCustomerId,
    movementDate: movementDate || new Date().toISOString(),
    remarks: composeRemarks(reason, remarks),
  };
}
