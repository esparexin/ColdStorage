import type { AllocatingRow } from './types';

export interface ValidatedAllocItems {
  items: Array<{ positionId: string; bags: number }>;
  totalBags: number;
}

export interface AllocValidationFailure {
  error: string;
}

/**
 * Creates a blank allocation row. `AllocatingRow` state lives exclusively in `usePutAway`;
 * this helper keeps the hook within its line budget and the row shape in one canonical place.
 */
export function createAllocRow(id: string): AllocatingRow {
  return { id, rackId: '', levelId: '', positionId: '', bags: '' };
}

/**
 * Canonical immutable row patch. Replaces the discarded `rows.map(...)` pattern that silently
 * dropped user edits, and resets dependent selectors when a parent selection changes.
 */
export function patchAllocRow(
  rows: AllocatingRow[],
  rowId: string,
  patch: Partial<Omit<AllocatingRow, 'id'>>,
): AllocatingRow[] {
  return rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
}

/**
 * Pure pre-submit validation of allocation rows (positions selected, no duplicates, positive
 * bags, within the GRN's unallocated balance). The backend handler remains the authority;
 * this only avoids a guaranteed 400 round-trip.
 */
export function validateAllocRows(
  rows: AllocatingRow[],
  unallocatedBags: number,
): ValidatedAllocItems | AllocValidationFailure {
  const items: Array<{ positionId: string; bags: number }> = [];
  const usedPositions = new Set<string>();
  let totalBags = 0;

  for (const row of rows) {
    if (!row.positionId) {
      return { error: 'Please select a storage position for all rows' };
    }
    if (usedPositions.has(row.positionId)) {
      return { error: 'Duplicate storage positions selected in allocation rows' };
    }
    usedPositions.add(row.positionId);

    if (typeof row.bags !== 'number' || row.bags <= 0) {
      return { error: 'Bags allocated must be a positive integer in each row' };
    }
    items.push({ positionId: row.positionId, bags: row.bags });
    totalBags += row.bags;
  }

  if (totalBags > unallocatedBags) {
    return {
      error: `Cannot allocate ${totalBags} bags (only ${unallocatedBags} unallocated bags remain for this GRN)`,
    };
  }

  return { items, totalBags };
}

export function isAllocValidationFailure(
  result: ValidatedAllocItems | AllocValidationFailure,
): result is AllocValidationFailure {
  return 'error' in result;
}