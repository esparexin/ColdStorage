import type { Grn } from '@cold-storage/contracts';

export interface CorrectionRecord {
  grnId: string;
  grnNumber: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
}

const TRACKED_FIELDS = [
  'customerId',
  'customerName',
  'date',
  'commodityId',
  'commodityName',
  'chamber',
  'bagType',
  'bags',
  'smallBags',
  'bigBags',
  'smallBagWeight',
  'bigBagWeight',
  'rentType',
  'rentMonths',
  'rentAmount',
  'bagPrice',
  'smallBagPrice',
  'bigBagPrice',
  'gpNumber',
  'storageMark',
  'partyMark',
  'marks',
  'vehicleNumber',
  'remarks',
] as const;

function pickTracked(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of TRACKED_FIELDS) out[key] = source[key];
  return out;
}

/** Snapshot of every full-edit-tracked field before the correction. */
export function buildCorrectionBefore(grn: Record<string, unknown>): Record<string, unknown> {
  return pickTracked(grn);
}

/** Snapshot of every full-edit-tracked field after the correction. */
export function buildCorrectionAfter(corrected: Grn): Record<string, unknown> {
  return pickTracked(corrected as unknown as Record<string, unknown>);
}
