import type { DeliveryChallan, MergedConsignmentBreakdown } from '@cold-storage/contracts';

export interface MergedStockPools {
  isMerged: boolean;
  initialUnclassified: number;
  initialConfirmedSmall: number;
  initialConfirmedBig: number;
  initialConfirmedHybrid: number;
  confirmedBagType: 'S/B' | 'Hybrid';
  availableUnclassified: number;
  availableConfirmedSmall: number;
  availableConfirmedBig: number;
  availableConfirmedHybrid: number;
  availableConfirmedTotal: number;
  totalAvailable: number;
}

export function calculateRemainingMergedStockPools(
  breakdown: MergedConsignmentBreakdown | null | undefined,
  priorDeliveries: DeliveryChallan[],
): MergedStockPools | null {
  if (!breakdown || !breakdown.isMergedTarget || breakdown.totalMergedAddedBags <= 0) {
    return null;
  }

  const initialUnclassified = breakdown.genesisBags;
  const initialConfirmedSmall = breakdown.repackedSmallBags ?? 0;
  const initialConfirmedBig = breakdown.repackedBigBags ?? 0;
  const initialConfirmedHybrid = breakdown.repackedHybridBags ?? 0;
  const confirmedBagType: 'S/B' | 'Hybrid' = breakdown.repackedBagType ?? 'S/B';

  let priorUnclassified = 0;
  let priorConfirmedSmall = 0;
  let priorConfirmedBig = 0;
  let priorConfirmedHybrid = 0;

  for (const doc of priorDeliveries) {
    if (doc.status === 'REVERSED') continue;
    if (doc.unclassifiedDispatch) {
      const u = doc.unclassifiedDispatch;
      const uQty = u.quantity ?? ((u.smallBags ?? 0) + (u.bigBags ?? 0));
      priorUnclassified += uQty;
    }
    if (doc.confirmedDispatch) {
      const c = doc.confirmedDispatch;
      priorConfirmedSmall += c.smallBags ?? 0;
      priorConfirmedBig += c.bigBags ?? 0;
      priorConfirmedHybrid += c.quantity ?? ((c.smallBags ?? 0) + (c.bigBags ?? 0));
    }
  }

  const availableUnclassified = Math.max(0, initialUnclassified - priorUnclassified);
  const availableConfirmedSmall = Math.max(0, initialConfirmedSmall - priorConfirmedSmall);
  const availableConfirmedBig = Math.max(0, initialConfirmedBig - priorConfirmedBig);
  const availableConfirmedHybrid = Math.max(0, initialConfirmedHybrid - priorConfirmedHybrid);
  const availableConfirmedTotal =
    confirmedBagType === 'Hybrid'
      ? availableConfirmedHybrid
      : availableConfirmedSmall + availableConfirmedBig;

  return {
    isMerged: true,
    initialUnclassified,
    initialConfirmedSmall,
    initialConfirmedBig,
    initialConfirmedHybrid,
    confirmedBagType,
    availableUnclassified,
    availableConfirmedSmall,
    availableConfirmedBig,
    availableConfirmedHybrid,
    availableConfirmedTotal,
    totalAvailable: availableUnclassified + availableConfirmedTotal,
  };
}
