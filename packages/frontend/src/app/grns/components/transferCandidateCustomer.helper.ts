import type { Customer } from '@cold-storage/contracts';

/**
 * Resolves candidate transferee customers for Transfer Ownership Step 1:
 * - Excludes the current GRN owner (cannot transfer ownership to oneself).
 * - Excludes inactive customers.
 * - Merges and dedupes newly created customers in the current session.
 */
export function resolveCandidateTransferees(
  customers: Customer[],
  currentOwnerId: string,
  createdCustomers: Customer[] = [],
): Customer[] {
  const map = new Map<string, Customer>();
  customers.forEach((c) => map.set(c.id, c));
  createdCustomers.forEach((c) => {
    if (!map.has(c.id)) map.set(c.id, c);
  });
  return Array.from(map.values()).filter(
    (c) => c.id !== currentOwnerId && c.isActive,
  );
}

