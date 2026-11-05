import type { RentDeliveryBill } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import type { RentPaymentDoc } from '../../database/models/rent-payment.model.js';
import { reconcileDeliveriesWithPayments } from '../delivery/handlers/delivery-settlement-reconciliation.helper.js';

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

  const challansByGrn = new Map<string, typeof challans>();
  for (const c of challans) {
    const list = challansByGrn.get(c.grnId);
    if (list) list.push(c);
    else challansByGrn.set(c.grnId, [c]);
  }

  for (const grnId of grnIds) {
    const grnChallans = challansByGrn.get(grnId) ?? [];
    if (grnChallans.length === 0) continue;

    const grnPayments = paymentsByGrn.get(grnId) ?? [];
    const reconciliationMap = reconcileDeliveriesWithPayments(grnChallans, grnPayments);

    const bills: RentDeliveryBill[] = grnChallans.map((c) => {
      const recon = reconciliationMap.get(c.id);
      const charge = c.rentCharge ?? 0;
      const delPaid = recon?.rentTotalPaid ?? 0;
      const remaining = recon?.rentRemainingBalance ?? charge;
      const status: 'Settled' | 'Not Settled' =
        recon?.rentPaymentStatus ?? (charge > 0 && remaining === 0 ? 'Settled' : 'Not Settled');

      return {
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
    });

    result.set(grnId, bills);
  }

  return result;
}
