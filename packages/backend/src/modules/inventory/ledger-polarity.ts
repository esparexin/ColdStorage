/**
 * Canonical inventory ledger polarity (P5/P7).
 *
 * Physical stock is derived from the immutable ledger: an inward put-away adds bags, an
 * outward delivery removes them, and a delivery reversal restores them. Every aggregate that
 * reports occupancy (dashboard, stock summary export) must apply this expression exactly
 * once, otherwise the same physical quantity is double-counted or sign-flipped.
 *
 * Every row carries a bag composition rather than one signed total, so the small/big split
 * survives inward, outward and reversal. `ledgerBagQuantity` is the ONLY place the two stored
 * parts are added together; aggregations must reference it rather than re-deriving the sum, so
 * a future change to the composition shape has exactly one place to change.
 */

/** Sum of a row's stored bag composition. Usable anywhere an aggregation references a field. */
export const ledgerBagQuantity = {
  $add: [{ $ifNull: ['$smallQuantity', 0] }, { $ifNull: ['$bigQuantity', 0] }],
} as const;

/**
 * Per-type composition of a row, used where a report must break a balance down by bag type.
 */
export const ledgerBagComposition = {
  small: { $ifNull: ['$smallQuantity', 0] },
  big: { $ifNull: ['$bigQuantity', 0] },
} as const;

export const ledgerSignedQuantity = {
  $cond: [
    { $eq: ['$transactionType', 'INWARD_PUTAWAY'] },
    ledgerBagQuantity,
    {
      $cond: [
        { $eq: ['$transactionType', 'DELIVERY_REVERSAL'] },
        ledgerBagQuantity,
        {
          $cond: [
            { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
            { $multiply: [ledgerBagQuantity, -1] },
            0,
          ],
        },
      ],
    },
  ],
} as const;

/**
 * Per-type signed composition, matching ledgerSignedQuantity's polarity exactly. Applying a
 * sign to the sum and to each part separately is what would let the parts and the total drift.
 */
export const ledgerSignedComposition = {
  small: {
    $cond: [
      { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
      { $multiply: [ledgerBagComposition.small, -1] },
      ledgerBagComposition.small,
    ],
  },
  big: {
    $cond: [
      { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
      { $multiply: [ledgerBagComposition.big, -1] },
      ledgerBagComposition.big,
    ],
  },
} as const;