import { z } from 'zod';
import { chamberTextSchema, rentalAmountSchema } from './common.js';
import { rentTypeSchema } from './grn.js';
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
  commodityName: z.string().min(1),
  chamber: chamberTextSchema,
  inwardDate: z.coerce.date(),
  totalBags: z.number().int().min(1),
  rentType: rentTypeSchema,
  rentAmount: rentalAmountSchema,
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

export const monthlyOccupancyPeriodSchema = z.object({
  grnId: z.string().min(1),
  grnNumber: z.string().min(1),
  inwardDate: z.coerce.date(),
  outwardDate: z.coerce.date().nullable().optional(),
  billingPeriod: z.string().min(1),
  applicableMonth: z.string().min(1),
  periodIndex: z.number().int().min(1),
  openingBags: z.number().int().min(0),
  deliveredBags: z.number().int().min(0),
  remainingBags: z.number().int().min(0),
  occupancyBags: z.number().int().min(0),
  bagRate: z.number().min(0),
  calculatedCharge: z.number().min(0),
});

export type MonthlyOccupancyPeriod = z.infer<typeof monthlyOccupancyPeriodSchema>;

export const grnOccupancyRentSummarySchema = z.object({
  grnId: z.string().min(1),
  facilityId: z.string().min(1),
  grnNumber: z.string().min(1),
  rentType: rentTypeSchema,
  totalInwardBags: z.number().int().positive(),
  currentRemainingBags: z.number().int().min(0),
  bagRate: z.number().min(0),
  totalOccupancyCharge: z.number().min(0),
  periods: z.array(monthlyOccupancyPeriodSchema),
});

export type GrnOccupancyRentSummary = z.infer<typeof grnOccupancyRentSummarySchema>;
