export function validateTransferConfirmation(
  isUnverified: boolean,
  remainingBags: number,
  confirmedSmallBags: number | '',
  confirmedBigBags: number | '',
): string | null {
  if (!isUnverified) return null;
  if (typeof confirmedSmallBags !== 'number' || typeof confirmedBigBags !== 'number') {
    return `Confirmed composition required for unverified GRN (${remainingBags} bags). Confirm Small + Big counts.`;
  }
  if (confirmedSmallBags + confirmedBigBags !== remainingBags) {
    return `Confirmed counts (${confirmedSmallBags} + ${confirmedBigBags}) must equal stock of ${remainingBags} bags.`;
  }
  return null;
}
