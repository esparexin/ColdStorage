import { z } from 'zod';

/**
 * Independent business identifiers (P0-Decision 1 & 2).
 * - grnNumber, receiptNumber, challanNumber, rentReceiptNumber: independent counters.
 * - gpNumber: optional, opaque free-text string without automatic sequence or format constraints.
 * - No equality or shared sequence assumption between any of these identifiers.
 */
const baseIdentifierSchema = z.string().trim().min(3).max(40);

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

export type GrnNumber = z.infer<typeof grnNumberSchema>;
export type BondNumber = z.infer<typeof bondNumberSchema>;
export type ReceiptNumber = z.infer<typeof receiptNumberSchema>;
export type ChallanNumber = z.infer<typeof challanNumberSchema>;
export type RentReceiptNumber = z.infer<typeof rentReceiptNumberSchema>;
