import {
  hasPositiveHybridRate,
  isHybridBagCategory,
  validateHybridQuantityInput,
  type TransferOwnershipInput,
} from '@cold-storage/contracts';

export function validateTransferBagConfirmation(
  input: TransferOwnershipInput,
  ledgerTotal: number,
  grnNumber: string,
  isVerified: boolean,
): void {
  const category = input.sourceBagType ?? input.sourceBagCategory ?? null;
  const quantity = input.sourceQuantity ?? null;
  const cSmall = input.confirmedSmallBags ?? null;
  const cBig = input.confirmedBigBags ?? null;

  if (category === 'Small' || category === 'Big' || category === 'S' || category === 'B') {
    throw new Error('Small-only and Big-only confirmation uses the Small & Big split (enter 0 for the unused side)');
  }
  const hasHybrid = category != null && (category === 'Hybrid' || isHybridBagCategory(category));
  const hasSplit = cSmall != null || cBig != null;

  if (!isVerified) {
    if (hasHybrid) {
      assertQty(quantity, ledgerTotal, grnNumber);
      if (!hasPositiveHybridRate({
        bagPrice: input.sourceBagPrice,
        seasonalBagPrice: input.sourceSeasonalBagPrice,
        monthlyBagPrice: input.sourceMonthlyBagPrice,
      })) {
        throw new Error('Confirmed Hybrid lots require a per-bag rate (Each Bag Price, or Seasonal/Monthly rates)');
      }
      return;
    }
    if (cSmall == null || cBig == null) {
      throw new Error(
        `Confirmed bag composition is required for transfer of GRN '${grnNumber}' with unverified composition (${ledgerTotal} bags). Confirm Small + Big counts reconciling to the available stock.`,
      );
    }
  }
  if (hasHybrid && quantity != null) assertQty(quantity, ledgerTotal, grnNumber);
  if (hasSplit) {
    const s = cSmall ?? 0;
    const b = cBig ?? 0;
    if (!Number.isInteger(s) || !Number.isInteger(b) || s < 0 || b < 0) {
      throw new Error('Confirmed bag counts must be whole non-negative numbers');
    }
    if (s + b > ledgerTotal) {
      throw new Error(
        `Confirmed transfer counts (${s} small + ${b} big = ${s + b}) cannot exceed available stock of ${ledgerTotal} bags for GRN '${grnNumber}'`,
      );
    }
    if (s + b !== ledgerTotal) {
      throw new Error(
        `Confirmed transfer counts (${s} small + ${b} big = ${s + b}) must reconcile with available stock of ${ledgerTotal} bags for GRN '${grnNumber}'`,
      );
    }
  }
}

function assertQty(qty: number | null, total: number, grnNumber: string): void {
  const err = validateHybridQuantityInput(qty, total, 'available stock');
  if (err) {
    if (err.includes('must match')) {
      throw new Error(`Confirmed Hybrid quantity (${qty}) must match available stock of ${total} bags for GRN '${grnNumber}'`);
    }
    throw new Error('Confirmed Hybrid quantity must be a positive whole number');
  }
}

