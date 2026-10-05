/**
 * Indian Financial Year helpers (Asia/Kolkata, starting 1 April).
 *
 * Lives apart from the GRN contract because every FY-sequenced document series — inward receipt,
 * delivery challan and rent receipt alike — depends on it, so it is a shared numbering concern
 * rather than a property of any one document.
 */

/** Calculates Indian Financial Year string from a date in Asia/Kolkata (IST). Starts April 1. */
export function getFinancialYearKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(date));
  const year = parseInt(
    parts.find((p) => p.type === 'year')?.value ?? String(new Date(date).getFullYear()),
    10,
  );
  const month = parseInt(
    parts.find((p) => p.type === 'month')?.value ?? String(new Date(date).getMonth() + 1),
    10,
  );
  const startYear = month < 4 ? year - 1 : year;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}