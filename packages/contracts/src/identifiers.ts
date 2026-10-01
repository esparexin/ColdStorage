import { z } from 'zod';

/**
 * Independent business identifiers (P0-Decision 1 & 2).
 * - grnNumber, receiptNumber, challanNumber, rentReceiptNumber: independent counters.
 * - gpNumber: optional, opaque free-text string without automatic sequence or format constraints.
 * - No equality or shared sequence assumption between any of these identifiers.
 */
const baseIdentifierSchema = z.string().trim().min(3).max(40);

export const grnNumberSchema = baseIdentifierSchema;
export const receiptNumberSchema = baseIdentifierSchema;
export const challanNumberSchema = baseIdentifierSchema;
export const rentReceiptNumberSchema = baseIdentifierSchema;
export const gpNumberSchema = z.string().trim().max(40).nullish();

export const documentNumberingModeSchema = z.enum(['FY_SEQUENTIAL', 'PENDING_CONFIRMATION']);

export const fyCounterSchema = z.object({
  key: z.string().min(1), // e.g. "GRN:2025-26", "RECEIPT:2025-26", "CHALLAN:2025-26", "RENT_RECEIPT:2025-26"
  lastSequence: z.number().int().min(0),
});

export type FyCounter = z.infer<typeof fyCounterSchema>;
