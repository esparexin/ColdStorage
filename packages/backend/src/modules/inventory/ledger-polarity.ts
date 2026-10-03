/**
 * Canonical inventory ledger polarity (P5/P7).
 *
 * Physical stock is derived from the immutable ledger: an inward put-away adds bags, an
 * outward delivery removes them, and a delivery reversal restores them. Every aggregate that
 * reports occupancy (dashboard, stock summary export) must apply this expression exactly
 * once, otherwise the same physical quantity is double-counted or sign-flipped.
 */
export const ledgerSignedQuantity = {
  $cond: [
    { $eq: ['$transactionType', 'INWARD_PUTAWAY'] },
    '$quantity',
    {
      $cond: [
        { $eq: ['$transactionType', 'DELIVERY_REVERSAL'] },
        '$quantity',
        {
          $cond: [
            { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
            { $multiply: ['$quantity', -1] },
            0,
          ],
        },
      ],
    },
  ],
};