import { z } from 'zod';

/**
 * Independent business identifiers (P0-Decision 1 & 2).
 * - grnNumber, receiptNumber, challanNumber, rentReceiptNumber: independent counters.
 * - gpNumber: optional, opaque free-text string without automatic sequence or format constraints.
 * - No equality or shared sequence assumption between any of these identifiers.
 */
const baseIdentifierSchema = z.string().trim().min(3).max(40);

export const grnNumberSchema = baseIdentifierSchema;
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
