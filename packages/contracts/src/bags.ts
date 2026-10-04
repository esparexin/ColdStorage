import { z } from 'zod';

/**
 * Single canonical bag model (P0-Decision 3 & 4).
 * - Bag Type: strictly controlled vocabulary of 'S', 'B', or 'S+B'.
 * - Weight is captured per individual bag only (Small Bag Weight / Big Bag Weight).
 * - No nominal/weighbridge/total-weight concepts exist in the GRN workflow.
 */
export const bagTypeSchema = z.enum(['S', 'B', 'S+B']);
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

  if (small <= 0 || big <= 0) {
    return 'Bag type S+B requires a positive small bag count and a positive big bag count';
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
  return { smallBags: smallBags ?? 0, bigBags: bigBags ?? 0 };
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
