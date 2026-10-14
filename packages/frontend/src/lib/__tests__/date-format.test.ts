import { describe, expect, it } from 'vitest';
import { formatDisplayDate } from '../date-format';

describe('formatDisplayDate', () => {
  it('returns fallback for null, undefined, or empty string', () => {
    expect(formatDisplayDate(null)).toBe('—');
    expect(formatDisplayDate(undefined)).toBe('—');
    expect(formatDisplayDate('')).toBe('—');
    expect(formatDisplayDate(null, { fallback: 'N/A' })).toBe('N/A');
  });

  it('handles invalid dates gracefully', () => {
    expect(formatDisplayDate('invalid-date')).toBe('invalid-date');
    expect(formatDisplayDate('not a date', { fallback: '—' })).toBe('—');
  });

  it('formats Date objects and ISO strings with short month by default', () => {
    const d = new Date('2026-10-14T10:30:00Z');
    const result = formatDisplayDate(d);
    expect(result).toMatch(/14\s+Oct\s+2026/);

    const fromString = formatDisplayDate('2026-05-01');
    expect(fromString).toMatch(/01\s+May\s+2026/);
  });

  it('supports custom month and year formats', () => {
    const d = new Date('2026-10-14T00:00:00Z');
    const twoDigit = formatDisplayDate(d, { monthFormat: '2-digit', yearFormat: '2-digit' });
    expect(twoDigit).toMatch(/14\/10\/26|14-10-26/);

    const longMonth = formatDisplayDate(d, { monthFormat: 'long' });
    expect(longMonth).toMatch(/14\s+October\s+2026/);
  });

  it('supports includeTime option', () => {
    const d = new Date('2026-10-14T15:45:30Z');
    const result = formatDisplayDate(d, { includeTime: true });
    expect(result).toContain('2026');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});
