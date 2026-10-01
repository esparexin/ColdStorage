import { describe, expect, it } from 'vitest';
import { CsvSerializer } from '../modules/import-export/csv.serializer.js';

describe('P8 CsvSerializer', () => {
  // 1. Simple primitives
  it('serializes simple primitives (strings, booleans) without quotes when no special characters present', () => {
    expect(CsvSerializer.serializeCell('hello')).toBe('hello');
    expect(CsvSerializer.serializeCell(true)).toBe('true');
    expect(CsvSerializer.serializeCell(false)).toBe('false');
    expect(CsvSerializer.serializeCell(12345)).toBe('12345');
    expect(CsvSerializer.serializeRow(['ABC', 100, true])).toBe('ABC,100,true\r\n');
  });

  // 2. Commas in string
  it('wraps strings containing commas in double quotes', () => {
    expect(CsvSerializer.serializeCell('Plot 4, Sector 9')).toBe('"Plot 4, Sector 9"');
  });

  // 3. Double quotes in string
  it('wraps strings containing internal double quotes and escapes them as ""', () => {
    expect(CsvSerializer.serializeCell('He said "Hello"')).toBe('"He said ""Hello"""');
  });

  // 4. Multiline strings
  it('wraps multiline strings containing \\n or \\r\\n in quotes', () => {
    expect(CsvSerializer.serializeCell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    expect(CsvSerializer.serializeCell('Line 1\r\nLine 2')).toBe('"Line 1\r\nLine 2"');
  });

  // 5. null and undefined
  it('serializes null and undefined as empty strings', () => {
    expect(CsvSerializer.serializeCell(null)).toBe('');
    expect(CsvSerializer.serializeCell(undefined)).toBe('');
    expect(CsvSerializer.serializeRow(['A', null, 'B'])).toBe('A,,B\r\n');
  });

  // 6. Date formatting
  it('formats Date objects as ISO 8601 strings', () => {
    const d = new Date('2026-10-01T12:00:00.000Z');
    expect(CsvSerializer.serializeCell(d)).toBe('2026-10-01T12:00:00.000Z');
  });

  // 7. Formula injection: =
  it("prepends ' to strings beginning with =", () => {
    expect(CsvSerializer.serializeCell('=SUM(A1:A10)')).toBe('"\'=SUM(A1:A10)"');
    expect(CsvSerializer.serializeCell('=1+1')).toBe('"\'=1+1"');
  });

  // 8. Formula injection: +
  it("prepends ' to strings beginning with +", () => {
    expect(CsvSerializer.serializeCell('+1234567890')).toBe('"\'+\\1234567890"'.replace('\\', ''));
    expect(CsvSerializer.serializeCell('+cmd|')).toBe('"\'+\\cmd|"'.replace('\\', ''));
  });

  // 9. Formula injection: -
  it("prepends ' to strings beginning with -", () => {
    expect(CsvSerializer.serializeCell('-5+2')).toBe('"\'-\\5+2"'.replace('\\', ''));
    expect(CsvSerializer.serializeCell('-cmd')).toBe('"\'-\\cmd"'.replace('\\', ''));
  });

  // 10. Formula injection: @, \t, \r
  it("prepends ' to strings beginning with @, \\t, or \\r", () => {
    expect(CsvSerializer.serializeCell('@SUM')).toBe('"\'@SUM"');
    expect(CsvSerializer.serializeCell('\tTAB_VALUE')).toBe('"\'\tTAB_VALUE"');
    expect(CsvSerializer.serializeCell('\rCR_VALUE')).toBe('"\'\rCR_VALUE"');
  });

  // 11. Regression: legitimate negative numbers are NOT prefixed with apostrophe
  it('negative numeric safety (regression): legitimate negative numbers are exported as numbers and are NOT prefixed with an apostrophe', () => {
    expect(CsvSerializer.serializeCell(-42)).toBe('-42');
    expect(CsvSerializer.serializeCell(-10.5)).toBe('-10.5');
    expect(CsvSerializer.serializeCell(-0.01)).toBe('-0.01');
    expect(CsvSerializer.serializeRow(['Balance', -500])).toBe('Balance,-500\r\n');
  });
});
