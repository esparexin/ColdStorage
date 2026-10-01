import { z } from 'zod';

export const importRowResultSchema = z.object({
  row: z.number().int().positive(),
  status: z.enum(['committed', 'rejected']),
  id: z.string().optional(),
  referenceNumber: z.string().optional(),
  errors: z.array(z.string()).optional(),
});

export const importSummarySchema = z
  .object({
    totalRows: z.number().int().nonnegative(),
    committed: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    results: z.array(importRowResultSchema),
  })
  .refine(
    (data) =>
      data.committed + data.rejected === data.totalRows && data.results.length === data.totalRows,
    {
      message:
        'Import summary counts must reconcile: committed + rejected == totalRows and results.length == totalRows',
      path: ['totalRows'],
    },
  );

export const exportDateRangeQuerySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid from date format (YYYY-MM-DD)')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid to date format (YYYY-MM-DD)')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return data.from < data.to;
      }
      return true;
    },
    {
      message: "'from' date must be strictly earlier than 'to' date",
      path: ['from'],
    },
  );

export const stockSummaryExportQuerySchema = z.object({}).strict();

export type ImportRowResult = z.infer<typeof importRowResultSchema>;
export type ImportSummary = z.infer<typeof importSummarySchema>;
export type ExportDateRangeQuery = z.infer<typeof exportDateRangeQuerySchema>;
export type StockSummaryExportQuery = z.infer<typeof stockSummaryExportQuerySchema>;
