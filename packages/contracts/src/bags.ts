import { z } from 'zod';

/** Canonical bag model: bagType S/B/S+B/S/B/Hybrid, per-bag weights, total `bags`. */
export const bagTypeSchema = z.enum(['S', 'B', 'S+B', 'S/B', 'Hybrid']).default('S/B');
export type BagType = z.infer<typeof bagTypeSchema>;

/** Per-bag weight in kg for one individual bag of the respective type. */
export const perBagWeightSchema = z
  .number({ invalid_type_error: 'Bag weight must be a number' })
  .positive('Bag weight must be greater than zero')
  .max(1000, 'Bag weight cannot exceed 1,000 kg');

export const bagAccountingSchema = z.object({
  bagType: bagTypeSchema,
  bags: z.number().int().positive().max(100000),
  smallBagWeight: perBagWeightSchema.nullish(),
  bigBagWeight: perBagWeightSchema.nullish(),
});

export type BagAccounting = z.infer<typeof bagAccountingSchema>;

/** Fully-populated composition: single-type stores zero on unused side; bags == small + big. */
export const bagCompositionSchema = z.object({
  smallBags: z.number().int().min(0).max(100000),
  bigBags: z.number().int().min(0).max(100000),
});

export type BagComposition = z.infer<typeof bagCompositionSchema>;

/** Derived total of a composition. Never persisted alongside its parts. */
export function compositionTotal(composition: BagComposition): number {
  return composition.smallBags + composition.bigBags;
}

export interface NormalizeCompositionInput {
  bagType: BagType;
  /** Total bags declared on the receipt. Authoritative for single-type receipts. */
  bags: number;
  smallBags?: number | null;
  bigBags?: number | null;
}

/** Returns inconsistency reason or null; shared by contract refine and normalizer. */
export function bagCompositionIssue(input: NormalizeCompositionInput): string | null {
  const { bagType, bags, smallBags, bigBags } = input;
  const small = smallBags ?? 0;
  const big = bigBags ?? 0;

  if (bagType === 'S') {
    return big > 0
      ? 'Bag type S declares no big bags, but a big bag count was supplied'
      : null;
  }

  if (bagType === 'B') {
    return small > 0
      ? 'Bag type B declares no small bags, but a small bag count was supplied'
      : null;
  }

  // S+B and S/B are mixed/general classification labels: the inward form captures Total Bags,
  // so a receipt may declare no split at all. When a split IS supplied, support all valid
  // compositions (all-small, all-big, mixed) that reconcile with the declared total.
  const hasSplit = smallBags != null || bigBags != null;
  if (!hasSplit) {
    return null;
  }
  if (small < 0 || big < 0) {
    return 'Small and big bag counts cannot be negative';
  }
  if (!Number.isInteger(small) || !Number.isInteger(big)) {
    return 'Small and big bag counts must be whole numbers';
  }
  if (small + big !== bags) {
    return `Small (${small}) plus big (${big}) bags must equal the declared total of ${bags} bags`;
  }
  return null;
}

/** Single place receipts resolve into a composition; stored total and parts cannot drift. */
export function normalizeBagComposition(input: NormalizeCompositionInput): BagComposition {
  const issue = bagCompositionIssue(input);
  if (issue) {
    throw new Error(issue);
  }

  const { bagType, bags, smallBags, bigBags } = input;
  if (bagType === 'S') {
    return { smallBags: bags, bigBags: 0 };
  }
  if (bagType === 'B') {
    return { smallBags: 0, bigBags: bags };
  }
  // When an explicit split is provided and matches total, preserve it.
  // Otherwise, unverified lots default to { smallBags: 0, bigBags: 0 } placeholder.
  const small = smallBags ?? 0;
  const big = bigBags ?? 0;
  const hasSplit = (smallBags != null || bigBags != null) && small + big === bags;
  if (hasSplit) {
    return { smallBags: small, bigBags: big };
  }
  return { smallBags: 0, bigBags: 0 };
}

/** Narrows an unknown value to a composition, returning null when it is not one. */
export function toBagComposition(value: unknown): BagComposition | null {
  const parsed = bagCompositionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Reusable Zod refinement rejecting a receipt whose declared total and bag composition disagree.
 *
 * Lives beside the rule it enforces so the contract and the normalizer cannot drift, and so the
 * same check can be attached to any payload that carries a composition.
 */
export function bagCompositionConsistent<T extends NormalizeCompositionInput>(value: T): boolean {
  return bagCompositionIssue(value) === null;
}

export const bagCompositionIssueMessage =
  'Bag composition is inconsistent with the declared bag type and total';

/**
 * Checks whether small and big bag quantities are explicitly verified and reconciled with total bags.
 * Single-type bags (S or B) are verified by definition once their non-zero side matches total bags.
 * Mixed bags (S+B or S/B) require explicit non-null small and big bag quantities summing to total.
 */
export function isBagCompositionVerified(input: {
  bagType?: BagType | null;
  bags: number;
  smallBags?: number | null;
  bigBags?: number | null;
  isCompositionVerified?: boolean | null;
}): boolean {
  if (typeof input.isCompositionVerified === 'boolean') return input.isCompositionVerified;
  const { bagType, bags, smallBags, bigBags } = input;
  if (bags <= 0) return true;
  const s = smallBags ?? 0;
  const b = bigBags ?? 0;
  if (s < 0 || b < 0 || !Number.isInteger(s) || !Number.isInteger(b)) return false;
  if (s === 0 && b === 0) return false;
  if (s + b !== bags) return false;

  if (bagType === 'S') return s === bags && b === 0;
  if (bagType === 'B') return b === bags && s === 0;
  if (bagType === 'Hybrid') return true;
  if (smallBags == null || bigBags == null) return false;
  return s + b === bags;
}

/** Stored verification: explicit flag wins; derived check is fallback for pre-flag docs. */
export function resolveStoredCompositionVerified(input: {
  isCompositionVerified?: boolean | null;
  bagType?: BagType | null;
  bags: number;
  smallBags?: number | null;
  bigBags?: number | null;
}): boolean {
  if (typeof input.isCompositionVerified === 'boolean') return input.isCompositionVerified;
  return isBagCompositionVerified(input);
}

/** Validates whether rent can be calculated authoritatively without guessing. */
export function canCalculateAuthoritativeRent(input: {
  bagType?: BagType | null;
  bags: number;
  smallBags?: number | null;
  bigBags?: number | null;
  bagPrice?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
}): { canCalculate: boolean; reason?: string } {
  const sRate = input.smallBagPrice ?? input.bagPrice ?? 0;
  const bRate = input.bigBagPrice ?? input.bagPrice ?? 0;
  const hasDiffRates =
    (input.smallBagPrice != null || input.bigBagPrice != null) &&
    sRate !== bRate;
  const isSb = input.bagType === 'S+B' || input.bagType === 'S/B' || input.bagType == null;

  if (hasDiffRates && isSb && !isBagCompositionVerified(input)) {
    return {
      canCalculate: false,
      reason: 'Small and big bag composition unverified; differential rates require confirmed counts',
    };
  }

  const hasAnyRate =
    (typeof input.bagPrice === 'number' && input.bagPrice > 0) ||
    (typeof input.smallBagPrice === 'number' && input.smallBagPrice > 0) ||
    (typeof input.bigBagPrice === 'number' && input.bigBagPrice > 0);

  if (!hasAnyRate && input.bags > 0) {
    return {
      canCalculate: false,
      reason: 'No applicable storage rates configured or verified',
    };
  }

  return { canCalculate: true };
}

/**
 * Resolves resulting canonical bag type ('S', 'B', 'S+B', or 'S/B') when merging lots.
 * Preserves target's existing mixed classification ('S+B' or 'S/B'). Single-type target
 * transitions to 'S+B' (or 'S/B') when merged with opposite type or when mixed.
 */
export function resolveMergedBagType(input: {
  targetBagType: BagType;
  sourceBagTypes?: BagType[];
  newSmallBags: number;
  newBigBags: number;
}): BagType {
  const { targetBagType, sourceBagTypes = [], newSmallBags, newBigBags } = input;
  if (targetBagType === 'Hybrid' && sourceBagTypes.every((t) => t === 'Hybrid')) return 'Hybrid';
  if (newSmallBags > 0 && newBigBags === 0) return targetBagType === 'B' ? 'S' : targetBagType;
  if (newBigBags > 0 && newSmallBags === 0) return targetBagType === 'S' ? 'B' : targetBagType;
  if (targetBagType === 'S+B' || targetBagType === 'S/B') return targetBagType;
  if (sourceBagTypes.includes('S+B')) return 'S+B';
  if (sourceBagTypes.includes('S/B')) return 'S/B';
  return 'S+B';
}

/** Canonical SSOT check for Hybrid bag category; recognizes canonical 'Hybrid' and legacy aliases. */
export function isHybridBagCategory(category?: string | null): boolean {
  if (!category) return false;
  const c = category.trim().toLowerCase();
  return c === 'hybrid' || c === 'modern' || c === 'modern size' || c === 'mixed';
}

/**
 * Canonical Hybrid ledger split shared by Outward Delivery and Internal Move:
 * fill Small from remaining Small first, remainder to Big. Reconciles to the
 * requested total by construction.
 */
export function allocateHybridSplit(remainingSmall: number, remainingBig: number, requestedTotal: number): BagComposition {
  const allocSmall = Math.min(Math.max(0, requestedTotal), Math.max(0, remainingSmall));
  return { smallBags: allocSmall, bigBags: Math.max(0, requestedTotal) - allocSmall };
}


