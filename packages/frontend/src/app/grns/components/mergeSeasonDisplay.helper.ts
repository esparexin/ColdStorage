export interface SeasonRelationBadge {
  label: string;
  variant: 'warning' | 'neutral' | 'primary';
}

/**
 * Formats the operational season label for a GRN based on its inward date.
 * - March-December inwards belong to that calendar year's season (e.g. "Season 2026").
 * - January-February inwards belong to the pre-season monthly period leading into
 *   that year's season (e.g. "Season 2026 (Jan–Feb Monthly)").
 */
export function formatGrnSeasonLabel(inwardDate: Date | string | null | undefined): string {
  if (!inwardDate) return 'Season —';
  const d = new Date(inwardDate);
  if (isNaN(d.getTime())) return 'Season —';
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month === 0 || month === 1) {
    return `Season ${year} (Jan–Feb Monthly)`;
  }
  return `Season ${year}`;
}

/**
 * Resolves the relational season badge relative to a target season year.
 * - Same season: no badge.
 * - Jan-Feb of same target year: "Jan–Feb <year> (Monthly)" (neutral).
 * - Earlier season year: "Prev <year>" or "Prev <year> (Jan–Feb)" (warning).
 */
export function resolveSourceSeasonBadge(
  sourceDate: Date | string | null | undefined,
  targetSeason: number,
): SeasonRelationBadge | null {
  if (!sourceDate) return null;
  const d = new Date(sourceDate);
  if (isNaN(d.getTime())) return null;
  const srcYear = d.getFullYear();
  const month = d.getMonth();
  const isJanFeb = month === 0 || month === 1;

  if (isJanFeb) {
    if (srcYear === targetSeason) {
      return { label: `Jan–Feb ${srcYear} (Monthly)`, variant: 'neutral' };
    }
    if (srcYear < targetSeason) {
      return { label: `Prev ${srcYear} (Jan–Feb)`, variant: 'warning' };
    }
    return null;
  }

  if (srcYear < targetSeason) {
    return { label: `Prev ${srcYear}`, variant: 'warning' };
  }
  return null;
}

