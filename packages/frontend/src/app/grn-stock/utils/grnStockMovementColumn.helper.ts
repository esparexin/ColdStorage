import type { Grn } from '@cold-storage/contracts';

export interface MergeInInfo {
  sourceNumbers: string[];
  date: string | Date | null;
}

export type MovementTypeResult =
  | { kind: 'merge'; label: 'Merge' }
  | { kind: 'merge-in'; label: string }
  | { kind: 'outward'; label: 'Outward' }
  | { kind: 'none'; label: '' };

export function resolveMovementType(
  row: Grn,
  mergeInMap?: Map<string, MergeInInfo>,
): MovementTypeResult {
  if (row.status === 'CLOSED') {
    const isMerged = Boolean(row.mergedIntoGrnId || row.mergedIntoGrnNumber);
    return isMerged
      ? { kind: 'merge', label: 'Merge' }
      : { kind: 'outward', label: 'Outward' };
  }

  const mergeIn = mergeInMap?.get(row.grnNumber) || (row.id ? mergeInMap?.get(row.id) : undefined);
  if (mergeIn && mergeIn.sourceNumbers.length > 0) {
    return {
      kind: 'merge-in',
      label: `MERGE IN: ${mergeIn.sourceNumbers.join(', ')}`,
    };
  }

  if ((row.netDeliveredBags ?? 0) > 0) {
    return { kind: 'outward', label: 'Outward' };
  }

  return { kind: 'none', label: '' };
}

export function resolveMovementDate(
  row: Grn,
  mergeInMap?: Map<string, MergeInInfo>,
): string | Date | null {
  if (row.status === 'CLOSED') {
    const isMerged = Boolean(row.mergedIntoGrnId || row.mergedIntoGrnNumber);
    const match = isMerged && row.remarks ? row.remarks.match(/on\s+(\d{4}-\d{2}-\d{2})/) : null;
    return match?.[1] ?? row.updatedAt ?? null;
  }

  const mergeIn = mergeInMap?.get(row.grnNumber) || (row.id ? mergeInMap?.get(row.id) : undefined);
  if (mergeIn?.date) {
    return mergeIn.date;
  }

  if ((row.netDeliveredBags ?? 0) > 0) {
    return row.updatedAt ?? null;
  }

  return null;
}
