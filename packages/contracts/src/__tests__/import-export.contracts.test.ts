import { describe, expect, it } from 'vitest';
import {
  exportDateRangeQuerySchema,
  importRowResultSchema,
  importSummarySchema,
  stockSummaryExportQuerySchema,
} from '../import-export.js';

describe('P8 Import & Export Contracts', () => {
  // 1. importRowResultSchema — valid committed
  it('importRowResultSchema: accepts valid committed row result with id and referenceNumber', () => {
    const result = importRowResultSchema.safeParse({
      row: 1,
      status: 'committed',
      id: 'grn-12345',
      referenceNumber: 'GRN-2026-000001',
    });
    expect(result.success).toBe(true);
  });

  // 2. importRowResultSchema — valid rejected
  it('importRowResultSchema: accepts valid rejected row result with field-level errors array', () => {
    const result = importRowResultSchema.safeParse({
      row: 2,
      status: 'rejected',
      errors: ['Chamber not found', 'Invalid bag type'],
    });
    expect(result.success).toBe(true);
  });

  // 3. importRowResultSchema — invalid status or negative row
  it('importRowResultSchema: rejects invalid status or negative row index', () => {
    const invalidStatus = importRowResultSchema.safeParse({
      row: 1,
      status: 'pending',
    });
    expect(invalidStatus.success).toBe(false);

    const negativeRow = importRowResultSchema.safeParse({
      row: -1,
      status: 'committed',
      id: 'cust-1',
    });
    expect(negativeRow.success).toBe(false);
  });

  // 4. importSummarySchema — reconciliation refinement
  it('importSummarySchema: validates consistent totalRows, committed, rejected, and results array length via refinement', () => {
    const validSummary = importSummarySchema.safeParse({
      totalRows: 2,
      committed: 1,
      rejected: 1,
      results: [
        { row: 1, status: 'committed', id: 'cust-1' },
        { row: 2, status: 'rejected', errors: ['Duplicate mobile'] },
      ],
    });
    expect(validSummary.success).toBe(true);

    const unreconciledSummary = importSummarySchema.safeParse({
      totalRows: 3, // claims 3, but committed(1) + rejected(1) = 2
      committed: 1,
      rejected: 1,
      results: [
        { row: 1, status: 'committed', id: 'cust-1' },
        { row: 2, status: 'rejected', errors: ['Duplicate mobile'] },
      ],
    });
    expect(unreconciledSummary.success).toBe(false);
  });

  // 5. exportDateRangeQuerySchema — valid from and to
  it('exportDateRangeQuerySchema: accepts valid YYYY-MM-DD strings for from/to', () => {
    const result = exportDateRangeQuerySchema.safeParse({
      from: '2026-04-01',
      to: '2026-04-30',
    });
    expect(result.success).toBe(true);
  });

  // 6. exportDateRangeQuerySchema — single-ended date filter
  it('exportDateRangeQuerySchema: accepts single-ended date filter (from-only or to-only)', () => {
    const fromOnly = exportDateRangeQuerySchema.safeParse({
      from: '2026-04-01',
    });
    expect(fromOnly.success).toBe(true);

    const toOnly = exportDateRangeQuerySchema.safeParse({
      to: '2026-05-01',
    });
    expect(toOnly.success).toBe(true);
  });

  // 7. exportDateRangeQuerySchema — rejects from >= to
  it('exportDateRangeQuerySchema: rejects from >= to via Zod refinement rule', () => {
    const equalDates = exportDateRangeQuerySchema.safeParse({
      from: '2026-04-01',
      to: '2026-04-01',
    });
    expect(equalDates.success).toBe(false);

    const invertedDates = exportDateRangeQuerySchema.safeParse({
      from: '2026-05-01',
      to: '2026-04-01',
    });
    expect(invertedDates.success).toBe(false);
  });

  // 8. stockSummaryExportQuerySchema — strictly rejects date params
  it('stockSummaryExportQuerySchema: strictly rejects from/to parameters via .strict()', () => {
    const emptyQuery = stockSummaryExportQuerySchema.safeParse({});
    expect(emptyQuery.success).toBe(true);

    const withFrom = stockSummaryExportQuerySchema.safeParse({
      from: '2026-04-01',
    });
    expect(withFrom.success).toBe(false);

    const withTo = stockSummaryExportQuerySchema.safeParse({
      to: '2026-04-30',
    });
    expect(withTo.success).toBe(false);
  });
});
