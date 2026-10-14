/**
 * Canonical Date Display Formatter for Cold Storage Management System
 * Enforces Single Source of Truth (SSOT) for date presentation across tables and views.
 */

export interface FormatDisplayDateOptions {
  includeTime?: boolean;
  monthFormat?: 'short' | '2-digit' | 'long';
  yearFormat?: 'numeric' | '2-digit';
  fallback?: string;
}

/**
 * Formats a date value safely into the canonical Indian English ('en-IN') locale representation.
 * Supports ISO strings, Date instances, timestamps, and gracefully handles invalid or nullish inputs.
 *
 * Default format: 'DD MMM YYYY' (e.g. '14 Oct 2026')
 */
export function formatDisplayDate(
  val?: string | Date | number | null,
  options?: FormatDisplayDateOptions,
): string {
  if (val == null || val === '') {
    return options?.fallback ?? '—';
  }

  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) {
    return options?.fallback ?? (typeof val === 'string' ? val : '—');
  }

  const monthFormat = options?.monthFormat ?? 'short';
  const yearFormat = options?.yearFormat ?? 'numeric';

  if (options?.includeTime) {
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: monthFormat,
      year: yearFormat,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: monthFormat,
    year: yearFormat,
  });
}
