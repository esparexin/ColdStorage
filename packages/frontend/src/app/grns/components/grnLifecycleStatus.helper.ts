export interface GrnLifecycleStatusDisplay {
  badge: 'Closed' | 'Merged' | 'Active' | 'Partial' | 'Pending Payment';
  variant: 'neutral' | 'success' | 'warning' | 'danger';
  icon: 'GitMerge' | 'Check' | 'CheckCircle2' | 'Clock' | 'AlertCircle';
  mergedReference?: string | null;
  isMergedLot?: boolean;
}

export function resolveGrnLifecycleStatus(row: {
  status: string;
  bags: number;
  closingBags?: number | null;
  netDeliveredBags?: number | null;
  mergedIntoGrnNumber?: string | null;
  mergedIntoGrnId?: string | null;
  remarks?: string | null;
}): GrnLifecycleStatusDisplay {
  const isMergedSource = Boolean(row.mergedIntoGrnNumber || row.mergedIntoGrnId);
  const isMergedTarget = Boolean(row.remarks && row.remarks.includes('[MERGE RECEIVED'));
  const delivered = row.netDeliveredBags ?? 0;
  const remaining =
    row.closingBags !== undefined && row.closingBags !== null
      ? row.closingBags
      : (isMergedSource ? 0 : Math.max(0, row.bags - delivered));
  const isClosed = row.status === 'CLOSED' || remaining === 0;

  if (isClosed) {
    return {
      badge: 'Closed',
      variant: 'neutral',
      icon: isMergedSource ? 'GitMerge' : 'Check',
      mergedReference: row.mergedIntoGrnNumber ? `Merged → ${row.mergedIntoGrnNumber}` : null,
      isMergedLot: isMergedTarget,
    };
  }

  if (isMergedSource) {
    return {
      badge: 'Merged',
      variant: 'neutral',
      icon: 'GitMerge',
      mergedReference: row.mergedIntoGrnNumber ? `Merged → ${row.mergedIntoGrnNumber}` : null,
    };
  }

  if (delivered === 0 && remaining > 0) {
    return {
      badge: 'Active',
      variant: 'success',
      icon: 'CheckCircle2',
      isMergedLot: isMergedTarget,
    };
  }

  if (remaining > 0) {
    return {
      badge: 'Partial',
      variant: 'warning',
      icon: 'Clock',
      isMergedLot: isMergedTarget,
    };
  }

  return {
    badge: 'Pending Payment',
    variant: 'danger',
    icon: 'AlertCircle',
    isMergedLot: isMergedTarget,
  };
}
