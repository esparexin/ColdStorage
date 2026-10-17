import { describe, expect, it } from 'vitest';
import { extractMergedDate } from '../grnMergedDate.helper';

describe('grnMergedDate.helper', () => {
  it('extracts merge date from standard merge remarks', () => {
    const remarks =
      '[MERGED into GRN 0022 on 2026-10-12: 100 bags cleared. Financial record preserved. Reason: Consolidation]';
    const date = extractMergedDate(remarks);
    expect(date).not.toBeNull();
    expect(date?.toISOString().slice(0, 10)).toBe('2026-10-12');
  });

  it('extracts merge date with full GRN number prefix', () => {
    const remarks =
      '[MERGED into GRN GRN-26-27-0038 on 2026-10-15: 300 bags cleared. Reason: Stock consolidation]';
    const date = extractMergedDate(remarks);
    expect(date).not.toBeNull();
    expect(date?.toISOString().slice(0, 10)).toBe('2026-10-15');
  });

  it('extracts merge date when remarks contain multiple lines', () => {
    const remarks =
      'Original inward remark\n[MERGED into GRN 0015 on 2026-10-10: 631 bags cleared]';
    const date = extractMergedDate(remarks);
    expect(date).not.toBeNull();
    expect(date?.toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('returns null when remarks is null or undefined', () => {
    expect(extractMergedDate(null)).toBeNull();
    expect(extractMergedDate(undefined)).toBeNull();
    expect(extractMergedDate('')).toBeNull();
  });

  it('returns null when remarks does not contain a merge note', () => {
    expect(extractMergedDate('Regular customer remarks without merge info')).toBeNull();
  });

  it('returns null when date format inside merge note is invalid', () => {
    expect(extractMergedDate('[MERGED into GRN 0015 on invalid-date: 10 bags]')).toBeNull();
  });
});
