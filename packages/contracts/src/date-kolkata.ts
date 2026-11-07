export interface KolkataDateParts {
  year: number;
  month: number; // 0-based: 0 = January, 1 = February, ..., 11 = December
  day: number;
  ymd: string; // 'YYYY-MM-DD'
}

/**
 * Extracts the calendar year, 0-based month, and day in the facility's official timezone (Asia/Kolkata).
 * Ensures consistency across Node servers running in UTC (e.g. cloud environments) and local development.
 */
export function toKolkataDateParts(dateVal?: Date | string | null): KolkataDateParts | null {
  if (!dateVal) return null;
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
    const [y, m, d] = dateVal.trim().split('-').map(Number);
    return {
      year: y,
      month: m - 1,
      day: d,
      ymd: dateVal.trim(),
    };
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const [y, m, day] = parts.split('-').map(Number);
  return {
    year: y,
    month: m - 1,
    day,
    ymd: parts,
  };
}
