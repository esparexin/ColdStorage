import { parse } from 'csv-parse/sync';

export const CUSTOMER_IMPORT_REQUIRED_HEADERS = ['name'] as const;
export const CUSTOMER_IMPORT_ALLOWED_HEADERS = ['name'] as const;

export const GRN_IMPORT_REQUIRED_HEADERS = [
  'date',
  'customerName',
  'commodityName',
  'chamber',
  'bags',
  'bagType',
  'rentType',
  'rentAmount',
] as const;

export const GRN_IMPORT_ALLOWED_HEADERS = [
  'date',
  'customerName',
  'commodityName',
  'chamber',
  'bags',
  'bagType',
  'rentType',
  'rentMonths',
  'rentAmount',
  'smallBagWeight',
  'bigBagWeight',
  'vehicleNumber',
  'gpNumber',
  'marks',
  'remarks',
] as const;

/**
 * Parses and validates raw CSV content structurally.
 * Guarantees 0 database queries and 0 database writes if structural checks fail.
 */
export function parseAndValidateCsv(
  csvContent: string | Buffer,
  requiredHeaders: readonly string[],
  allowedHeaders: readonly string[],
): { headers: string[]; dataRows: string[][] } {
  let records: string[][];
  try {
    records = parse(csvContent, {
      bom: true,
      relax_column_count: false,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (
      lower.includes('inconsistent') ||
      lower.includes('column') ||
      lower.includes('record length')
    ) {
      throw new Error(`INCONSISTENT_COLUMN_COUNT: ${msg}`);
    }
    throw new Error(`MALFORMED_CSV: ${msg}`);
  }

  if (!records || records.length === 0) {
    throw new Error('EMPTY_CSV_FILE: CSV file contains no records');
  }

  const headers = records[0];
  if (new Set(headers).size !== headers.length) {
    throw new Error('DUPLICATE_CSV_HEADERS: CSV contains duplicate headers');
  }

  const missing = requiredHeaders.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(`MISSING_CSV_HEADERS: Missing required headers: ${missing.join(', ')}`);
  }

  const unknown = headers.filter((h) => !allowedHeaders.includes(h));
  if (unknown.length > 0) {
    throw new Error(`UNKNOWN_CSV_HEADERS: Unrecognized headers: ${unknown.join(', ')}`);
  }

  const dataRows = records.slice(1);
  if (dataRows.length === 0) {
    throw new Error('EMPTY_CSV_FILE: CSV file contains 0 data rows');
  }

  if (dataRows.length > 500) {
    throw new Error('ROW_LIMIT_EXCEEDED: CSV file contains more than 500 data rows');
  }

  return { headers, dataRows };
}
