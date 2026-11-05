import type { RentDeliveryBill } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import type { RentPaymentDoc } from '../../database/models/rent-payment.model.js';

/**
 * Resolves issued delivery challans for a set of GRNs and computes per-delivery
 * rent charges, payments, and balances into canonical RentDeliveryBill items.
 */
export async function findDeliveryBillsForGrns(
  facilityId: string,
  grnIds: string[],
  paymentsByGrn: Map<string, RentPaymentDoc[]>,
): Promise<Map<string, RentDeliveryBill[]>> {
  const challans = await DeliveryChallanModel.find(
    { facilityId, status: 'ISSUED', grnId: { $in: grnIds } },
    null,
    { lean: true },
  )
    .sort({ date: 1, createdAt: 1 })
    .exec();

  const result = new Map<string, RentDeliveryBill[]>();

  for (const c of challans) {
    const grnPayments = paymentsByGrn.get(c.grnId) ?? [];
    const delPaid = grnPayments
      .filter((p) => p.deliveryId === c.id)
      .reduce((sum, p) => sum + p.amountPaid, 0);

    const charge = c.rentCharge ?? 0;
    const remaining = Math.max(0, Number((charge - delPaid).toFixed(2)));
    const status: 'Settled' | 'Not Settled' =
      charge > 0 && remaining === 0 ? 'Settled' : 'Not Settled';

    const bill: RentDeliveryBill = {
      deliveryId: c.id,
      challanNumber: c.challanNumber,
      gpNumber: c.gpNumber ?? null,
      date: c.date,
      totalBags: (c.smallBags ?? 0) + (c.bigBags ?? 0),
      smallBags: c.smallBags ?? 0,
      bigBags: c.bigBags ?? 0,
      rentCharge: charge,
      rentTotalPaid: delPaid,
      rentRemainingBalance: remaining,
      rentPaymentStatus: status,
    };

    const list = result.get(c.grnId);
    if (list) list.push(bill);
    else result.set(c.grnId, [bill]);
  }

  return result;
}
