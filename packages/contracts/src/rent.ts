import { z } from 'zod';
import { chamberTextSchema, rentalAmountSchema } from './common.js';
import { grnStatusSchema, rentTypeSchema } from './grn.js';
import { rentReceiptNumberSchema } from './identifiers.js';
import { rentExtensionSchema } from './rent-extension.js';

export const paymentModeSchema = z.enum(['Cash', 'UPI']);
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const paymentStatusSchema = z.enum(['Settled', 'Not Settled']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const rentStateSchema = z.enum(['SETTLED', 'PENDING', 'UNBILLED', 'PENDING_VERIFICATION']);
export type RentState = z.infer<typeof rentStateSchema>;

export const recordRentPaymentInputSchema = z
  .object({
    grnId: z.string().trim().min(1, 'GRN ID is required'),
    amountPaid: z
      .number({ invalid_type_error: 'Amount paid must be a number' })
      .min(0, 'Amount paid cannot be negative'),
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
  amountPaid: z.number().min(0),
  paymentMode: paymentModeSchema,
  paymentDate: z.coerce.date(),
  notes: z.string().nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.coerce.date(),
});

export type RentPayment = z.infer<typeof rentPaymentSchema>;

export const mergedSourceBillingItemSchema = z.object({
  grnId: z.string().optional(),
  grnNumber: z.string().min(1),
  receiptNumber: z.string().nullable().optional(),
  dateStr: z.string().nullable().optional(),
  seasonYear: z.number().int().optional(),
  customerName: z.string().nullable().optional(),
  bags: z.number().int().min(0),
  rentAmount: z.number().min(0),
  amountPaid: z.number().min(0),
  remainingBalance: z.number().min(0),
  status: z.string().optional(),
});

export type MergedSourceBillingItem = z.infer<typeof mergedSourceBillingItemSchema>;

export const mergedRepackHamaliItemSchema = z.object({
  repackBags: z.number().int().min(0),
  ratePerBag: z.number().min(0),
  amount: z.number().min(0),
});

export type MergedRepackHamaliItem = z.infer<typeof mergedRepackHamaliItemSchema>;

export const mergedConsignmentBreakdownSchema = z.object({
  isMergedTarget: z.boolean(),
  totalMergedAddedBags: z.number().int().min(0),
  repackHamali: mergedRepackHamaliItemSchema.nullable().optional(),
  totalCarriedRent: z.number().min(0).default(0),
  totalSeparateSourceRent: z.number().min(0).default(0),
  sources: z.array(mergedSourceBillingItemSchema).default([]),
  genesisBags: z.number().int().min(0),
  genesisCustomerName: z.string().optional(),
});

export type MergedConsignmentBreakdown = z.infer<typeof mergedConsignmentBreakdownSchema>;

/**
 * Parses the authoritative structured remark written by merge-grn.handler upon consignment merge.
 * Returns null if the account remarks do not indicate a merged destination consignment.
 */
export function parseMergedConsignmentBreakdown(
  remarks: string | null | undefined,
  totalAccountBags: number,
  customerName: string,
): MergedConsignmentBreakdown | null {
  if (!remarks || !remarks.includes('[MERGE RECEIVED')) {
    return null;
  }

  const addedBagsMatch = remarks.match(/\+(\d+)\s+bags/);
  const totalMergedAddedBags = addedBagsMatch ? parseInt(addedBagsMatch[1], 10) : 0;

  const repackMatch = remarks.match(
    /Repacking Hamali:\s*₹(\d+(?:\.\d+)?)\s*\((\d+)\s*bags\s*@\s*₹(\d+(?:\.\d+)?)\/bag\)/i,
  );
  const repackHamali: MergedRepackHamaliItem | null = repackMatch
    ? {
        amount: parseFloat(repackMatch[1]),
        repackBags: parseInt(repackMatch[2], 10),
        ratePerBag: parseFloat(repackMatch[3]),
      }
    : null;

  const carriedMatch = remarks.match(/(?:Carried pending rent|Additional rent):\s*₹(\d+(?:\.\d+)?)/i);
  const totalCarriedRent = carriedMatch ? parseFloat(carriedMatch[1]) : 0;

  const separateSourceRentMatch = remarks.match(
    /Source pending rent:\s*₹(\d+(?:\.\d+)?)\s*kept as separate pending bills/i,
  );
  const totalSeparateSourceRent = separateSourceRentMatch
    ? parseFloat(separateSourceRentMatch[1])
    : 0;

  const sourceRegex =
    /GRN\s+([A-Za-z0-9-]+)\s*\((?:Receipt\s*#([^,]+),\s*)?(?:Date:\s*([^,]+),\s*)?(?:Customer:\s*([^,]+),\s*)?Bags:\s*(\d+),\s*Rent:\s*₹(\d+(?:\.\d+)?),\s*Paid:\s*₹(\d+(?:\.\d+)?),\s*Balance:\s*₹(\d+(?:\.\d+)?),\s*Status:\s*([^)]+)\)/gi;

  const sources: MergedSourceBillingItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = sourceRegex.exec(remarks)) !== null) {
    const dateStr = m[3]?.trim();
    const seasonYear = dateStr ? parseInt(dateStr.split('-')[0], 10) : undefined;
    sources.push({
      grnNumber: m[1],
      receiptNumber: m[2]?.trim(),
      dateStr,
      seasonYear,
      customerName: m[4]?.trim(),
      bags: parseInt(m[5], 10),
      rentAmount: parseFloat(m[6]),
      amountPaid: parseFloat(m[7]),
      remainingBalance: parseFloat(m[8]),
      status: m[9]?.trim(),
    });
  }

  const genesisBags = Math.max(0, totalAccountBags - totalMergedAddedBags);

  return {
    isMergedTarget: true,
    totalMergedAddedBags,
    repackHamali,
    totalCarriedRent,
    totalSeparateSourceRent,
    sources,
    genesisBags,
    genesisCustomerName: customerName,
  };
}

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
  deliveredBags: z.number().int().min(0).optional(),
  remainingBags: z.number().int().min(0).optional(),
  bagPrice: z.number().nullish(),
  smallBagPrice: z.number().nullish(),
  bigBagPrice: z.number().nullish(),
  totalBagsWeight: z.number().nullish(),
  rentType: rentTypeSchema,
  rentAmount: rentalAmountSchema,
  rentMonths: z.number().int().nullable().optional(),
  totalPaid: z.number().min(0),
  remainingBalance: z.number().min(0),
  paymentStatus: paymentStatusSchema,
  rentState: rentStateSchema.default('UNBILLED'),
  verificationReason: z.string().nullable().optional(),
  payments: z.array(rentPaymentSchema),
  /**
   * Finalized January/February extensions (additive to rentAmount).
   * Defaults to [] so payloads produced before the extension model still parse.
   */
  extensions: z.array(rentExtensionSchema).default([]),
  /**
   * Total due = rentAmount + sum(finalized extensions). Equals rentAmount when
   * no extensions exist, so pre-extension balances are unchanged.
   */
  totalDue: rentalAmountSchema.default(0),
  remarks: z.string().nullable().optional(),
  rentGeneratedDate: z.coerce.date().nullable().optional(),
  mergedIntoGrnId: z.string().nullable().optional(),
  mergedIntoGrnNumber: z.string().nullable().optional(),
  mergedConsignment: mergedConsignmentBreakdownSchema.nullable().optional(),
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
    const startYear = inDate.getMonth() < 2 ? yr - 1 : yr;
    sStart = sStart ?? new Date(startYear, 2, 1);
    sEnd = sEnd ?? new Date(startYear, 11, 31);
    sName = sName ?? `Season ${startYear}`;
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

  // Informational season length; the charge is the whole-season total.
  const seasonMonths = 10;
  const calculatedCharge = Number((totalBags * bagRate).toFixed(2));

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
