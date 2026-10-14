import { z } from 'zod';

/**
 * Independent business identifiers (P0-Decision 1 & 2).
 * - grnNumber: operator-entered, exactly four digits, unique per facility.
 * - receiptNumber, challanNumber, rentReceiptNumber: distinct document families, each
 *   carrying its own prefix so one can never be mistaken for another.
 * - gpNumber: optional, opaque free-text string without automatic sequence or format constraints.
 * - Inward Receipt Number is DERIVED from the GR Number (P0 amendment) rather than drawn
 *   from a sequence counter; see buildInwardReceiptNumber.
 */
const baseIdentifierSchema = z.string().trim().min(3).max(40);

/** Prefix for the Inward Receipt document family. Kept distinct from CHL / RRCPT / GP. */
export const INWARD_RECEIPT_PREFIX = 'RCPT';

export const grnNumberSchema = baseIdentifierSchema;

/**
 * GR Number as entered on the Inward form: a mandatory manual business number of exactly
 * four digits, numbers only, stored verbatim (e.g. "0004").
 *
 * There is no automatic allocation and no sequence enforcement — any unused four-digit
 * number is accepted. `grnNumberSchema` above stays permissive on purpose so legacy
 * `GRN-26-27-NNNN` rows keep validating on read.
 */
export const grnNumberInputSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'GRN must be exactly 4 digits (numbers only)');

export const bondNumberSchema = baseIdentifierSchema;
export const receiptNumberSchema = baseIdentifierSchema;
export const challanNumberSchema = baseIdentifierSchema;
export const rentReceiptNumberSchema = baseIdentifierSchema;
export const gpNumberSchema = z.string().trim().max(40).nullish();

/**
 * Builds the Inward Receipt Number for a GR Number.
 *
 * Shape: `RCPT-<financialYear>-<grnNumber>`, e.g. GRN `0099` received in FY
 * 2026-27 yields `RCPT-2026-27-0099`.
 *
 * The receipt is derived rather than sequence-allocated so that it can never
 * drift from its GRN, and so that no counter exists to be corrupted. The
 * previous counter-backed generator was poisoned in production: an
 * operator-supplied `billNumber` had its trailing digits captured by an
 * unanchored `/(\d+)$/` and pushed back into the counter with `$max`,
 * ratcheting `INWARD_RECEIPT.lastSequence` to 758696 against 22 GRNs. `$max`
 * is monotonic, so the damage was permanent.
 *
 * Uniqueness holds without a counter: `grnNumber` is unique per facility
 * (enforced by the `facilityId_1_grnNumber_1` unique index) and the receipt
 * number is unique per facility by the `facilityId_1_inwardReceiptNumber_1`
 * unique index. A four-digit GR Number cannot repeat within a facility, so
 * two receipts in the same facility cannot collide.
 */
export function buildInwardReceiptNumber(financialYear: string, grnNumber: string): string {
  return `${INWARD_RECEIPT_PREFIX}-${financialYear}-${grnNumber}`;
}

export type GrnNumber = z.infer<typeof grnNumberSchema>;
export type BondNumber = z.infer<typeof bondNumberSchema>;
export type ReceiptNumber = z.infer<typeof receiptNumberSchema>;
export type ChallanNumber = z.infer<typeof challanNumberSchema>;
export type RentReceiptNumber = z.infer<typeof rentReceiptNumberSchema>;
