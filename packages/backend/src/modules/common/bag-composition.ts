/**
 * Canonical bag-composition aggregation expressions.
 *
 * A stored receipt or challan carries `smallBags` + `bigBags`; the total is always their sum and
 * is never stored beside them. Every aggregation that needs a total therefore has to add the two
 * parts, and doing that inline at each call site is how a total and its parts drift apart.
 *
 * `ledgerBagQuantity` in `modules/inventory/ledger-polarity.ts` is the equivalent expression for
 * `InventoryTransaction`. This module owns the delivery-challan one; each stored shape has exactly
 * one owner.
 */
export const challanBagQuantity = {
  $add: [{ $ifNull: ['$smallBags', 0] }, { $ifNull: ['$bigBags', 0] }],
} as const;