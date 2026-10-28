import { z } from 'zod';
import {
  paymentModeSchema,
  rentPaymentSchema,
  rentSummaryDtoSchema,
} from './rent.js';

export const batchRentAllocationSchema = z.object({
  grnId: z.string().min(1, 'GRN ID is required'),
  amountPaid: z
    .number({ invalid_type_error: 'Amount paid must be a number' })
    .min(0, 'Amount paid cannot be negative'),
});

export type BatchRentAllocation = z.infer<typeof batchRentAllocationSchema>;

const baseBatchRentPaymentSchema = z.object({
  facilityId: z.string().min(1, 'Facility ID is required').optional(),
  customerId: z.string().min(1, 'Customer ID is required'),
  allocations: z
    .array(batchRentAllocationSchema)
    .min(1, 'At least one GRN allocation is required'),
  paymentMode: paymentModeSchema,
  paymentDate: z.coerce.date().default(() => new Date()),
  notes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').nullish(),
});

export const recordBatchRentPaymentInputSchema = baseBatchRentPaymentSchema
  .refine(
    (data: z.infer<typeof baseBatchRentPaymentSchema>) => {
      const maxAllowed = new Date(Date.now() + 5 * 60 * 1000);
      return data.paymentDate <= maxAllowed;
    },
    {
      message: 'Payment date cannot be in the future',
      path: ['paymentDate'],
    },
  )
  .refine(
    (data: z.infer<typeof baseBatchRentPaymentSchema>) => {
      const grnIds = data.allocations.map((a) => a.grnId);
      return new Set(grnIds).size === grnIds.length;
    },
    {
      message: 'Duplicate GRN allocations are not permitted in a single batch payment',
      path: ['allocations'],
    },
  );

export type RecordBatchRentPaymentInput = z.infer<typeof recordBatchRentPaymentInputSchema>;

export const recordBatchRentPaymentResultSchema = z.object({
  payments: z.array(rentPaymentSchema),
  summaries: z.array(rentSummaryDtoSchema),
  totalAmountPaid: z.number().min(0),
  settledGrnCount: z.number().int().min(0),
});

export type RecordBatchRentPaymentResult = z.infer<typeof recordBatchRentPaymentResultSchema>;
