import type { DeliveryChallan, DeliveryQuery, DeliverySummary } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { readLedgerBalance, readLedgerBalanceMany, readLedgerNetDelivered } from '../../inventory/ledger-balance.js';
import { toChallanEntity } from '../delivery.mappers.js';

export async function getDeliveryById(
  facilityId: string,
  deliveryId: string,
): Promise<DeliveryChallan | null> {
  const doc = await DeliveryChallanModel.findOne({ id: deliveryId, facilityId }).lean().exec();
  if (!doc) return null;
  const entity = toChallanEntity(doc);
  const payments = await RentPaymentModel.find({ facilityId, deliveryId }, null, { lean: true }).exec();
  const deliveryPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  const deliveryCharge = doc.rentCharge ?? 0;
  const deliveryRemaining = Math.max(0, Number((deliveryCharge - deliveryPaid).toFixed(2)));
  const deliveryPaymentStatus: 'Settled' | 'Not Settled' =
    deliveryCharge > 0 && deliveryRemaining === 0 ? 'Settled' : 'Not Settled';

  return {
    ...entity,
    rentPaymentStatus: deliveryPaymentStatus,
    rentRemainingBalance: deliveryRemaining,
    rentTotalAmount: deliveryCharge,
    rentTotalPaid: deliveryPaid,
  };
}

export async function listDeliveries(
  facilityId: string,
  query: DeliveryQuery,
): Promise<{ items: DeliveryChallan[]; total: number; page: number; limit: number }> {
  const filter: Record<string, unknown> = { facilityId };
  if (query.grnId) filter.grnId = query.grnId;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.status) filter.status = query.status;

  const skip = (query.page - 1) * query.limit;

  const [docs, total] = await Promise.all([
    DeliveryChallanModel.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean()
      .exec(),
    DeliveryChallanModel.countDocuments(filter).exec(),
  ]);

  const grnIds = Array.from(new Set(docs.map((d) => d.grnId)));
  const deliveryIds = docs.map((d) => d.id);
  // Batched rent summaries fix N+1 (F10) and lazy import breaks the
  // delivery->rent static cycle; rentService is loaded only on this path.
  const { rentService } = await import('../../rent/rent.service.js');
  const [grnDocs, balanceMap, allRentSummaries, paymentDocs] = await Promise.all([
    GrnModel.find({ id: { $in: grnIds }, facilityId }).lean().exec(),
    readLedgerBalanceMany(facilityId, grnIds),
    rentService.getRentSummariesForFacility(facilityId, grnIds),
    RentPaymentModel.find(
      { facilityId, deliveryId: { $in: deliveryIds } },
      null,
      { lean: true },
    ).exec(),
  ]);
  const wanted = new Set(grnIds);

  const deliveryPaidMap = new Map<string, number>();
  for (const p of paymentDocs) {
    if (p.deliveryId) {
      deliveryPaidMap.set(p.deliveryId, (deliveryPaidMap.get(p.deliveryId) ?? 0) + p.amountPaid);
    }
  }

  const grnMap = new Map(grnDocs.map((g) => [g.id, g]));
  const rentMap = new Map(
    (allRentSummaries ?? []).filter((r) => wanted.has(r.grnId)).map((r) => [r.grnId, r]),
  );

  return {
    items: docs.map((d) => {
      const entity = toChallanEntity(d);
      const grn = grnMap.get(d.grnId);
      const bal = balanceMap.get(d.grnId);
      const rent = rentMap.get(d.grnId);

      const deliveryCharge = d.rentCharge ?? 0;
      const deliveryPaid = Number((deliveryPaidMap.get(d.id) ?? 0).toFixed(2));
      const deliveryRemaining = Math.max(0, Number((deliveryCharge - deliveryPaid).toFixed(2)));
      const deliveryPaymentStatus: 'Settled' | 'Not Settled' =
        deliveryCharge > 0 && deliveryRemaining === 0
          ? 'Settled'
          : deliveryCharge === 0 && rent && rent.paymentStatus === 'Settled'
            ? 'Settled'
            : 'Not Settled';

      return {
        ...entity,
        originalBags: grn ? grn.bags : undefined,
        remainingSmallBags: bal ? bal.smallBags : undefined,
        remainingBigBags: bal ? bal.bigBags : undefined,
        remainingTotalBags: bal ? bal.total : undefined,
        rentPaymentStatus: deliveryPaymentStatus,
        rentRemainingBalance: deliveryRemaining,
        rentTotalAmount: deliveryCharge,
        rentTotalPaid: deliveryPaid,
      };
    }),
    total,
    page: query.page,
    limit: query.limit,
  };
}

export async function listDeliveriesForGrn(
  facilityId: string,
  grnId: string,
): Promise<DeliveryChallan[]> {
  const docs = await DeliveryChallanModel.find({ facilityId, grnId })
    .sort({ date: -1, createdAt: -1 })
    .lean()
    .exec();
  const deliveryIds = docs.map((d) => d.id);
  const paymentDocs = await RentPaymentModel.find(
    { facilityId, deliveryId: { $in: deliveryIds } },
    null,
    { lean: true },
  ).exec();
  const deliveryPaidMap = new Map<string, number>();
  for (const p of paymentDocs) {
    if (p.deliveryId) {
      deliveryPaidMap.set(p.deliveryId, (deliveryPaidMap.get(p.deliveryId) ?? 0) + p.amountPaid);
    }
  }

  return docs.map((d) => {
    const entity = toChallanEntity(d);
    const deliveryCharge = d.rentCharge ?? 0;
    const deliveryPaid = Number((deliveryPaidMap.get(d.id) ?? 0).toFixed(2));
    const deliveryRemaining = Math.max(0, Number((deliveryCharge - deliveryPaid).toFixed(2)));
    const deliveryPaymentStatus: 'Settled' | 'Not Settled' =
      deliveryCharge > 0 && deliveryRemaining === 0 ? 'Settled' : 'Not Settled';

    return {
      ...entity,
      rentPaymentStatus: deliveryPaymentStatus,
      rentRemainingBalance: deliveryRemaining,
      rentTotalAmount: deliveryCharge,
      rentTotalPaid: deliveryPaid,
    };
  });
}

export async function getDeliverySummary(
  facilityId: string,
  grnId: string,
): Promise<DeliverySummary> {
  // Every read below keys only on (facilityId, grnId), both of which the caller
  // already supplied, so they run concurrently rather than in sequence.
  const [grn, netDelivered, available, challanDocs] = await Promise.all([
    GrnModel.findOne({ id: grnId, facilityId }).lean().exec(),
    readLedgerNetDelivered(facilityId, grnId),
    readLedgerBalance(facilityId, grnId),
    DeliveryChallanModel.find({ facilityId, grnId })
      .sort({ date: -1, createdAt: -1 })
      .lean()
      .exec(),
  ]);

  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  const netDeliveredSmallBags = netDelivered.smallBags;
  const netDeliveredBigBags = netDelivered.bigBags;
  const netDeliveredBags = netDelivered.total;
  const availableSmallBags = available.smallBags;
  const availableBigBags = available.bigBags;
  const remainingDeliveryBalance = available.total;

  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    totalReceivedBags: grn.bags,
    netDeliveredBags,
    remainingDeliveryBalance,
    physicallyStoredBags: remainingDeliveryBalance,
    availableSmallBags,
    availableBigBags,
    netDeliveredSmallBags,
    netDeliveredBigBags,
    grnStatus: grn.status,
    deliveries: challanDocs.map((d) => toChallanEntity(d)),
  };
}

export async function resolveFacilityIdForDelivery(deliveryId: string): Promise<string | null> {
  const doc = await DeliveryChallanModel.findOne({ id: deliveryId })
    .select('facilityId')
    .lean()
    .exec();
  return doc?.facilityId ?? null;
}
