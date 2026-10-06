import { z } from 'zod';

export const internalMovementTypeSchema = z.enum(['MERGE', 'TRANSFER_OWNERSHIP']);
export type InternalMovementType = z.infer<typeof internalMovementTypeSchema>;

export const mergeGrnInputSchema = z.object({
  targetGrnId: z.string().trim().min(1, 'Target GRN ID is required'),
  sourceGrnIds: z.array(z.string().trim().min(1)).min(1, 'At least one source GRN is required'),
  movementDate: z.coerce.date().default(() => new Date()),
  additionalRentAmount: z.number().min(0).default(0),
  remarks: z.string().trim().min(3, 'Remarks must be at least 3 characters').max(500),
});
export type MergeGrnInput = z.infer<typeof mergeGrnInputSchema>;

export const transferOwnershipInputSchema = z.object({
  grnId: z.string().trim().min(1, 'GRN ID is required'),
  newCustomerId: z.string().trim().min(1, 'New Customer ID is required'),
  movementDate: z.coerce.date().default(() => new Date()),
  remarks: z.string().trim().min(3, 'Remarks must be at least 3 characters').max(500),
});
export type TransferOwnershipInput = z.infer<typeof transferOwnershipInputSchema>;

export const internalMovementRecordSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  movementType: internalMovementTypeSchema,
  movementDate: z.coerce.date(),
  targetGrnId: z.string().nullable().optional(),
  targetGrnNumber: z.string().nullable().optional(),
  sourceGrnIds: z.array(z.string()).default([]),
  sourceGrnNumbers: z.array(z.string()).default([]),
  totalBagsMoved: z.number().min(0).default(0),
  smallBagsMoved: z.number().min(0).default(0),
  bigBagsMoved: z.number().min(0).default(0),
  grnId: z.string().nullable().optional(),
  grnNumber: z.string().nullable().optional(),
  fromCustomerId: z.string().nullable().optional(),
  fromCustomerName: z.string().nullable().optional(),
  toCustomerId: z.string().nullable().optional(),
  toCustomerName: z.string().nullable().optional(),
  financialSnapshot: z.object({
    rentAmount: z.number().min(0),
    totalPaid: z.number().min(0),
    remainingBalance: z.number().min(0),
    paymentStatus: z.string(),
  }),
  remarks: z.string().nullable().optional(),
  performedBy: z.string().min(1),
  createdAt: z.coerce.date(),
});
export type InternalMovementRecord = z.infer<typeof internalMovementRecordSchema>;
