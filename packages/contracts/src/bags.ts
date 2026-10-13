import { z } from 'zod';

/**
 * Single canonical bag model (P0-Decision 3 & 4).
 * - Bag Type: strictly controlled vocabulary of 'S', 'B', 'S+B', or 'S/B' (informational, default 'S/B').
 * - Weight is captured per individual bag only (Small Bag Weight / Big Bag Weight).
 * - Primary operational metric is Total S/B Bags (`bags`).
 */
export const bagTypeSchema = z.enum(['S', 'B', 'S+B', 'S/B']).default('S/B');
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

/**
 * Authoritative bag composition for any inward receipt.
 *
 * Every GRN carries a fully-populated composition vector, whichever bag type was declared:
 * a single-type GRN simply has one side at zero. Nulls are unrepresentable, so "how many small
 * bags and how many big bags remain" is answerable for every GRN rather than only for mixed ones,
 * and no reader has to branch on bagType to interpret a balance.
 */
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

/**
 * Validates a declared receipt against its bag composition and returns the reason it is invalid,
 * or null when it is consistent. Shared by the create-GRN contract refine and the normalizer so
 * the validation rule and the normalization rule can never drift apart.
 */
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

/**
 * The single place a receipt's declared bags are resolved into a composition.
 *
 * The browser previously derived this by adding smallBags and bigBags on every keystroke, which
 * left `bags` and its parts free to disagree in the database because nothing re-derived or
 * rejected them server-side. Normalizing once, here, means the stored composition and the stored
 * total are the same fact expressed once, and the create-delivery guard can reason per bag type.
 */
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
  // Otherwise, default unsegregated lots to single-side composition.
  const small = smallBags ?? 0;
  const big = bigBags ?? 0;
  const hasSplit = (smallBags != null || bigBags != null) && small + big === bags;
  if (hasSplit) {
    return { smallBags: small, bigBags: big };
  }
  return { smallBags: bags, bigBags: 0 };
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
}): boolean {
  const { bagType, bags, smallBags, bigBags } = input;
  if (bags <= 0) return true;
  const s = smallBags ?? 0;
  const b = bigBags ?? 0;
  if (s < 0 || b < 0 || !Number.isInteger(s) || !Number.isInteger(b)) return false;
  if (s + b !== bags) return false;

  if (bagType === 'S') return s === bags && b === 0;
  if (bagType === 'B') return b === bags && s === 0;
  if (smallBags == null || bigBags == null) return false;
  return s + b === bags;
}

/**
 * Validates whether rent can be calculated authoritatively without guessing or fabricating bills.
 * If differential rates exist and composition is unverified, rent calculation must be marked pending verification.
 */
export function canCalculateAuthoritativeRent(input: {
  bagType?: BagType | null;
  bags: number;
  smallBags?: number | null;
  bigBags?: number | null;
  bagPrice?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
}): { canCalculate: boolean; reason?: string } {
  const hasDiffRates =
    (input.smallBagPrice != null || input.bigBagPrice != null) &&
    input.smallBagPrice !== input.bigBagPrice;

  if (hasDiffRates && !isBagCompositionVerified(input)) {
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


