/**
 * Helper to extract and format the authoritative merge date for merged source GRNs.
 * The merge date is preserved in the audit note written during the merge transaction:
 * `[MERGED into GRN <num> on <YYYY-MM-DD>: ...]`
 */

export function extractMergedDate(remarks?: string | null): Date | null {
  if (!remarks) return null;
  const match = remarks.match(/\[MERGED(?:\s+into\s+(?:GRN\s+)?[^\s]+)?\s+on\s+([^:\]]+)/i);
  if (!match || !match[1]) return null;
  const parsed = new Date(match[1].trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
