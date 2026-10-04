import { z } from 'zod';
import { paymentStatusSchema } from './rent.js';

export const storageOccupancyViewSchema = z.enum(['monthly', 'seasonal', 'movement']);
export type StorageOccupancyView = z.infer<typeof storageOccupancyViewSchema>;

export const storageOccupancyFilterSchema = z.object({
  view: storageOccupancyViewSchema.default('movement'),
  grnId: z.string().optional(),
  inwardDate: z.string().optional(),
  outwardDate: z.string().optional(),
  closingBalance: z.coerce.number().int().nonnegative().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});
export type StorageOccupancyFilter = z.infer<typeof storageOccupancyFilterSchema>;

export const storageOccupancyReportItemSchema = z.object({
  grnId: z.string(),
  grnNumber: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  commodityName: z.string(),
  chamber: z.string(),
  inwardDate: z.coerce.date(),
  outwardDate: z.coerce.date().nullable(),
  movementType: z.string(),
  openingBags: z.number().int().nonnegative(),
  deliveredBags: z.number().int().nonnegative(),
  closingBags: z.number().int().nonnegative(),
  marks: z.string().nullable(),
  gpNumber: z.string().nullable(),
  sbNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  month: z.string().nullable(),
  season: z.string().nullable(),
  applicableOccupancy: z.number().nonnegative(),
  calculatedRent: z.number().nonnegative(),
  paymentStatus: paymentStatusSchema,
  totalPaid: z.number().nonnegative(),
  remainingBalance: z.number().nonnegative(),
});
export type StorageOccupancyReportItem = z.infer<typeof storageOccupancyReportItemSchema>;

export const storageOccupancyReportSchema = z.object({
  facilityId: z.string(),
  generatedAt: z.coerce.date(),
  view: storageOccupancyViewSchema,
  totalRecords: z.number().int().nonnegative(),
  items: z.array(storageOccupancyReportItemSchema),
});
export type StorageOccupancyReport = z.infer<typeof storageOccupancyReportSchema>;
