import { z } from 'zod';
import { rentReceiptNumberSchema } from './identifiers.js';

export const paymentModeSchema = z.enum(['Cash', 'UPI']);
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const paymentStatusSchema = z.enum(['Settled', 'Not Settled']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const recordRentPaymentInputSchema = z
  .object({
    grnId: z.string().trim().min(1, 'GRN ID is required'),
    amountPaid: z
      .number({ invalid_type_error: 'Amount paid must be a number' })
      .positive('Amount paid must be greater than zero'),
    paymentMode: paymentModeSchema,
    paymentDate: z.coerce.date().default(() => new Date()),
    notes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').nullish(),
  })
  .refine(
    (data) => {
      // 5-minute future tolerance for clock skew
      const maxAllowed = new Date(Date.now() + 5 * 60 * 1000);
      return data.paymentDate <= maxAllowed;
    },
    {
      message: 'Payment date cannot be in the future',
      path: ['paymentDate'],
    },
  );

export type RecordRentPaymentInput = z.infer<typeof recordRentPaymentInputSchema>;

export const rentPaymentSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  grnId: z.string().min(1),
  grnNumber: z.string().min(1),
  receiptNumber: rentReceiptNumberSchema,
  amountPaid: z.number().positive(),
  paymentMode: paymentModeSchema,
  paymentDate: z.coerce.date(),
  notes: z.string().nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.coerce.date(),
});

export type RentPayment = z.infer<typeof rentPaymentSchema>;

export const rentSummaryDtoSchema = z.object({
  grnId: z.string().min(1),
  grnNumber: z.string().min(1),
  facilityId: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  customerMobile: z.string(),
  commodityName: z.string().min(1),
  chamberNumber: z.string().min(1),
  inwardDate: z.coerce.date(),
  totalBags: z.number().int().min(1),
  rentType: z.enum(['Monthly', 'Seasonal']),
  rentAmount: z.number().min(0),
  rentMonths: z.number().int().nullable().optional(),
  totalPaid: z.number().min(0),
  remainingBalance: z.number().min(0),
  paymentStatus: paymentStatusSchema,
  payments: z.array(rentPaymentSchema),
});

export type RentSummaryDto = z.infer<typeof rentSummaryDtoSchema>;

export const recordRentPaymentResultSchema = z.object({
  payment: rentPaymentSchema,
  summary: rentSummaryDtoSchema,
});

export type RecordRentPaymentResult = z.infer<typeof recordRentPaymentResultSchema>;
