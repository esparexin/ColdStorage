import { z } from 'zod';

export const hamaliRateSchema = z
  .number({ invalid_type_error: 'Hamali rate must be a number' })
  .min(0, 'Hamali rate cannot be negative')
  .max(10000, 'Hamali rate cannot exceed ₹10,000');

export type HamaliRate = z.infer<typeof hamaliRateSchema>;

/**
 * Authoritative Hamali labor charge calculation:
 * Total Bags × Hamali Rate per bag.
 * Bag-category agnostic: Small, Big, S+B, Hybrid, Mixed all calculate uniformly.
 */
export function calculateHamaliAmount(bags: number, hamaliRate?: number | null): number {
  if (!Number.isFinite(bags) || bags <= 0) return 0;
  if (typeof hamaliRate !== 'number' || !Number.isFinite(hamaliRate) || hamaliRate <= 0) return 0;
  return Number((bags * hamaliRate).toFixed(2));
}
