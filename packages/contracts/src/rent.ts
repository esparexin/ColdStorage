import { z } from 'zod';
import { chamberTextSchema, rentalAmountSchema } from './common.js';
import { grnStatusSchema, rentTypeSchema } from './grn.js';
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

export const seasonalOccupancySummarySchema = z.object({
  grnId: z.string().min(1),
  facilityId: z.string().min(1),
  grnNumber: z.string().min(1),
  seasonName: z.string().min(1),
  seasonStart: z.coerce.date(),
  seasonEnd: z.coerce.date(),
  inwardDate: z.coerce.date(),
  finalOutwardDate: z.coerce.date().nullable().optional(),
  totalInwardBags: z.number().int().positive(),
  netDeliveredBags: z.number().int().min(0),
  remainingBags: z.number().int().min(0),
  bagOccupancy: z.number().int().min(0),
  applicableRate: z.number().min(0),
  seasonMonths: z.number().int().min(1).default(10),
  calculatedCharge: z.number().min(0),
  status: grnStatusSchema,
});

export type SeasonalOccupancySummary = z.infer<typeof seasonalOccupancySummarySchema>;

export interface SeasonalOccupancyCalculationInput {
  grnId: string;
  facilityId: string;
  grnNumber: string;
  inwardDate: Date;
  totalBags: number;
  bagRate: number;
  movements: Array<{
    date: Date;
    type: string;
    deliveredBags: number;
    closingBags: number;
  }>;
  seasonName?: string;
  seasonStart?: Date;
  seasonEnd?: Date;
}

/**
 * Single Authoritative Seasonal Storage Rent Calculation.
 * Consumes the canonical movement history and derives seasonal occupancy, dates, and charges.
 */
export function calculateSeasonalOccupancy(input: SeasonalOccupancyCalculationInput): SeasonalOccupancySummary {
  const { grnId, facilityId, grnNumber, inwardDate, totalBags, bagRate, movements } = input;
  const inDate = new Date(inwardDate);

  let sStart = input.seasonStart;
  let sEnd = input.seasonEnd;
  let sName = input.seasonName;

  if (!sStart || !sEnd) {
    const yr = inDate.getFullYear();
    const startYear = inDate.getMonth() < 3 ? yr - 1 : yr;
    sStart = sStart ?? new Date(startYear, 3, 1);
    sEnd = sEnd ?? new Date(startYear + 1, 0, 31);
    sName = sName ?? `Season ${startYear}-${startYear + 1}`;
  }

  let netDelivered = 0;
  let remaining = totalBags;
  let finalOutwardDate: Date | null = null;

  for (const m of movements) {
    if (m.type === 'PARTIAL_OUTWARD' || m.type === 'FINAL_OUTWARD') {
      netDelivered += m.deliveredBags;
      remaining = Math.max(0, remaining - m.deliveredBags);
      if (remaining === 0) {
        finalOutwardDate = new Date(m.date);
      }
    } else if (m.type === 'DELIVERY_REVERSAL') {
      netDelivered = Math.max(0, netDelivered - m.deliveredBags);
      remaining = remaining + m.deliveredBags;
      if (remaining > 0) {
        finalOutwardDate = null;
      }
    }
  }

  const seasonMonths = 10;
  const calculatedCharge = Number((totalBags * bagRate * seasonMonths).toFixed(2));

  return {
    grnId,
    facilityId,
    grnNumber,
    seasonName: sName ?? 'Seasonal Term',
    seasonStart: sStart,
    seasonEnd: sEnd,
    inwardDate: inDate,
    finalOutwardDate,
    totalInwardBags: totalBags,
    netDeliveredBags: netDelivered,
    remainingBags: remaining,
    bagOccupancy: totalBags,
    applicableRate: bagRate,
    seasonMonths,
    calculatedCharge,
    status: remaining === 0 ? 'CLOSED' : 'OPEN',
  };
}
