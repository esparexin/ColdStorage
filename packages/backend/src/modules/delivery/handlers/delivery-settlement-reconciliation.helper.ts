/**
 * Delivery settlement reconciliation helper.
 * Reconciles outward delivery challans against rent payments recorded for a GRN.
 *
 * Business Rules:
 * 1. Direct payments with matching deliveryId, challanNumber, or gpNumber are allocated
 *    directly to that specific delivery.
 * 2. Unlinked / general GRN payments (e.g. collected at the GRN level without deliveryId)
 *    are allocated FIFO across outward deliveries in chronological order.
 * 3. Any surplus from an overpaid delivery rolls over into the unallocated pool.
 * 4. If the GRN's overall remaining balance is 0 or all obligations are paid,
 *    every delivery is marked 'Settled'.
 */

export interface ReconciledDeliveryPayment {
  rentTotalPaid: number;
  rentRemainingBalance: number;
  rentPaymentStatus: 'Settled' | 'Not Settled';
}

export interface ReconcilableChallan {
  id: string;
  challanNumber?: string | null;
  gpNumber?: string | null;
  rentCharge?: number | null;
  date: Date | string;
  createdAt?: Date | string | null;
}

export interface ReconcilablePayment {
  id?: string;
  deliveryId?: string | null;
  challanNumber?: string | null;
  gpNumber?: string | null;
  amountPaid: number;
  paymentDate?: Date | string | null;
  createdAt?: Date | string | null;
}

export function reconcileDeliveriesWithPayments(
  challans: ReconcilableChallan[],
  payments: ReconcilablePayment[],
): Map<string, ReconciledDeliveryPayment> {
  const result = new Map<string, ReconciledDeliveryPayment>();
  if (challans.length === 0) return result;

  // 1. Sort challans chronologically (earliest first) for deterministic FIFO allocation
  const sortedChallans = [...challans].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const createA = new Date(a.createdAt ?? 0).getTime();
    const createB = new Date(b.createdAt ?? 0).getTime();
    return createA - createB;
  });

  // 2. Build lookup maps for fast matching
  const challanById = new Map<string, ReconcilableChallan>();
  const challanByNumber = new Map<string, ReconcilableChallan>();
  const challanByGp = new Map<string, ReconcilableChallan>();

  for (const c of sortedChallans) {
    challanById.set(c.id, c);
    if (c.challanNumber) challanByNumber.set(c.challanNumber, c);
    if (c.gpNumber) challanByGp.set(c.gpNumber, c);
  }

  // 3. Match payments: direct vs unallocated
  const directPaidMap = new Map<string, number>();
  let unallocatedTotal = 0;

  for (const p of payments) {
    const amount = Number(p.amountPaid) || 0;
    if (amount <= 0) continue;

    let matchedChallanId: string | null = null;
    if (p.deliveryId && challanById.has(p.deliveryId)) {
      matchedChallanId = p.deliveryId;
    } else if (p.challanNumber && challanByNumber.has(p.challanNumber)) {
      matchedChallanId = challanByNumber.get(p.challanNumber)!.id;
    } else if (p.gpNumber && challanByGp.has(p.gpNumber)) {
      matchedChallanId = challanByGp.get(p.gpNumber)!.id;
    }

    if (matchedChallanId) {
      directPaidMap.set(matchedChallanId, (directPaidMap.get(matchedChallanId) ?? 0) + amount);
    } else {
      unallocatedTotal += amount;
    }
  }

  // 4. Distribute payments across challans in FIFO order
  for (const c of sortedChallans) {
    const charge = Math.max(0, Number(c.rentCharge ?? 0));
    const directPaid = directPaidMap.get(c.id) ?? 0;

    let paid = Math.min(charge, directPaid);
    const excessDirect = Math.max(0, directPaid - charge);
    unallocatedTotal += excessDirect;

    let need = Math.max(0, Number((charge - paid).toFixed(2)));
    if (need > 0 && unallocatedTotal > 0) {
      const fromUnallocated = Math.min(need, unallocatedTotal);
      paid = Number((paid + fromUnallocated).toFixed(2));
      unallocatedTotal = Number((unallocatedTotal - fromUnallocated).toFixed(2));
      need = Math.max(0, Number((charge - paid).toFixed(2)));
    }

    const remaining = need;
    const status: 'Settled' | 'Not Settled' =
      charge > 0 && remaining === 0
        ? 'Settled'
        : charge === 0
          ? 'Settled'
          : 'Not Settled';

    result.set(c.id, {
      rentTotalPaid: Number(paid.toFixed(2)),
      rentRemainingBalance: remaining,
      rentPaymentStatus: status,
    });
  }

  return result;
}

export interface CreditedChallanResult {
  id: string;
  challanNumber?: string | null;
  gpNumber?: string | null;
  date: Date | string;
  rentCharge: number;
  amountCredited: number;
}

/**
 * Resolves the exact subset of delivery challans credited by a specific payment transaction.
 * Follows deterministic chronological FIFO attribution to ensure that a receipt identifies
 * precisely which challans received funds from that payment.
 */
export function resolveCreditedChallansForPayment(
  targetPaymentId: string,
  challans: ReconcilableChallan[],
  payments: ReconcilablePayment[],
): CreditedChallanResult[] {
  if (challans.length === 0 || payments.length === 0) return [];

  const sortedChallans = [...challans].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  });

  const challanById = new Map<string, ReconcilableChallan>();
  const challanByNumber = new Map<string, ReconcilableChallan>();
  const challanByGp = new Map<string, ReconcilableChallan>();
  const remainingNeedMap = new Map<string, number>();

  for (const c of sortedChallans) {
    challanById.set(c.id, c);
    if (c.challanNumber) challanByNumber.set(c.challanNumber, c);
    if (c.gpNumber) challanByGp.set(c.gpNumber, c);
    remainingNeedMap.set(c.id, Math.max(0, Number(c.rentCharge ?? 0)));
  }

  const sortedPayments = [...payments].sort((a, b) => {
    const timeA = new Date(a.paymentDate ?? 0).getTime();
    const timeB = new Date(b.paymentDate ?? 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  });

  const creditedMap = new Map<string, number>();

  for (const p of sortedPayments) {
    const amount = Number(p.amountPaid) || 0;
    if (amount <= 0) continue;
    const isTarget = p.id === targetPaymentId;

    let matchedId: string | null = null;
    if (p.deliveryId && challanById.has(p.deliveryId)) matchedId = p.deliveryId;
    else if (p.challanNumber && challanByNumber.has(p.challanNumber)) matchedId = challanByNumber.get(p.challanNumber)!.id;
    else if (p.gpNumber && challanByGp.has(p.gpNumber)) matchedId = challanByGp.get(p.gpNumber)!.id;

    if (matchedId) {
      const need = remainingNeedMap.get(matchedId) ?? 0;
      const credit = Math.min(need, amount);
      remainingNeedMap.set(matchedId, Number((need - credit).toFixed(2)));
      if (isTarget && credit > 0) creditedMap.set(matchedId, (creditedMap.get(matchedId) ?? 0) + credit);

      let excess = Number((amount - credit).toFixed(2));
      if (excess > 0) {
        for (const c of sortedChallans) {
          if (excess <= 0) break;
          const rem = remainingNeedMap.get(c.id) ?? 0;
          if (rem <= 0) continue;
          const roll = Math.min(rem, excess);
          remainingNeedMap.set(c.id, Number((rem - roll).toFixed(2)));
          excess = Number((excess - roll).toFixed(2));
          if (isTarget && roll > 0) creditedMap.set(c.id, (creditedMap.get(c.id) ?? 0) + roll);
        }
      }
    } else {
      let unallocated = amount;
      for (const c of sortedChallans) {
        if (unallocated <= 0) break;
        const need = remainingNeedMap.get(c.id) ?? 0;
        if (need <= 0) continue;
        const credit = Math.min(need, unallocated);
        remainingNeedMap.set(c.id, Number((need - credit).toFixed(2)));
        unallocated = Number((unallocated - credit).toFixed(2));
        if (isTarget && credit > 0) creditedMap.set(c.id, (creditedMap.get(c.id) ?? 0) + credit);
      }
    }
  }

  const results: CreditedChallanResult[] = [];
  for (const c of sortedChallans) {
    const credited = creditedMap.get(c.id) ?? 0;
    if (credited > 0) {
      results.push({
        id: c.id, challanNumber: c.challanNumber, gpNumber: c.gpNumber,
        date: c.date, rentCharge: Number(c.rentCharge ?? 0),
        amountCredited: Number(credited.toFixed(2)),
      });
    }
  }
  return results;
}


