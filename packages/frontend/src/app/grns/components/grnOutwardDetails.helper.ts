import { isHybridBagCategory, type DeliveryChallan } from '@cold-storage/contracts';

export function formatOutwardCompositionText(
  challan: Pick<DeliveryChallan, 'bagCategory' | 'bagType' | 'totalBags' | 'smallBags' | 'bigBags'>,
): string {
  const isHybrid =
    challan.bagCategory === 'Hybrid' ||
    challan.bagType === 'Hybrid' ||
    isHybridBagCategory(challan.bagCategory) ||
    isHybridBagCategory(challan.bagType);

  if (isHybrid) {
    return `Hybrid - ${challan.totalBags.toLocaleString('en-IN')} bags`;
  }
  return `Small - ${challan.smallBags.toLocaleString('en-IN')}, Big - ${challan.bigBags.toLocaleString('en-IN')}`;
}
