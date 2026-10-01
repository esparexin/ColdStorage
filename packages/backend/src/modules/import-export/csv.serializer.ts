/**
 * Canonical CSV serializer with strict type discrimination and spreadsheet formula injection protection.
 *
 * Rules:
 * - null / undefined -> empty string ''
 * - number -> numeric string (never prefixed with apostrophe)
 * - boolean -> 'true' | 'false'
 * - Date -> ISO 8601 string
 * - string -> formula-injection guard (prepends ' if starts with =, +, -, @, \t, or \r),
 *             followed by RFC 4180 escaping (wraps in quotes and escapes internal " as "")
 */
export class CsvSerializer {
  public static serializeCell(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Numbers: serialize directly; NEVER apply formula injection prefix to numbers!
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : '';
    }

    // Booleans: serialize directly
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    // Dates: serialize as ISO 8601
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Strings: apply formula guard then RFC 4180 escaping
    let str = String(value);

    // Formula injection guard for untrusted text
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }

    // RFC 4180 escaping: if it contains delimiter, quote, newline, or was prepended with '
    if (/[",\n\r]/.test(str) || str.startsWith("'")) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  public static serializeRow(cells: unknown[]): string {
    return cells.map(CsvSerializer.serializeCell).join(',') + '\r\n';
  }
}
