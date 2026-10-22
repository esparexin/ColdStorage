import { isHybridBagCategory } from './bags.js';

export interface FormatDisplayBagTypeInput {
  bagType?: string | null;
  category?: string | null;
  smallBags?: number | null;
  bigBags?: number | null;
  isHybrid?: boolean;
}

/**
 * Canonical human-readable label for bag types and categories across the system.
 * Translates raw internal storage tokens ('S/B', 'S+B', 'S', 'B') to
 * clean user-facing labels ('Small & Big', 'Small', 'Big', 'Hybrid').
 */
export function formatDisplayBagType(input: FormatDisplayBagTypeInput): string {
  if (input.isHybrid || isHybridBagCategory(input.category) || isHybridBagCategory(input.bagType)) {
    return 'Hybrid';
  }
  const s = input.smallBags ?? 0;
  const b = input.bigBags ?? 0;
  if (s > 0 && b === 0) return 'Small';
  if (b > 0 && s === 0) return 'Big';
  const type = input.bagType ?? input.category;
  if (type === 'S' || type === 'Small') return 'Small';
  if (type === 'B' || type === 'Big') return 'Big';
  return 'Small & Big';
}
