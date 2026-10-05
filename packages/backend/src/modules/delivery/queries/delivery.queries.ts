import type { DeliveryChallan, DeliveryQuery, DeliverySummary } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { readLedgerBalance, readLedgerBalanceMany, readLedgerNetDelivered } from '../../inventory/ledger-balance.js';
import { rentService } from '../../rent/rent.service.js';
import { toChallanEntity } from '../delivery.mappers.js';

export async function getDeliveryById(
  facilityId: string,
  deliveryId: string,
): Promise<DeliveryChallan | null> {
  const doc = await DeliveryChallanModel.findOne({ id: deliveryId, facilityId }).lean().exec();
  return doc ? toChallanEntity(doc) : null;
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
  const [grnDocs, balanceMap, rentSummaries] = await Promise.all([
    GrnModel.find({ id: { $in: grnIds }, facilityId }).lean().exec(),
    readLedgerBalanceMany(facilityId, grnIds),
    Promise.all(grnIds.map((id) => rentService.getRentSummary(facilityId, id).catch(() => null))),
  ]);

  const grnMap = new Map(grnDocs.map((g) => [g.id, g]));
  const rentMap = new Map(
    rentSummaries.filter(Boolean).map((r) => [r!.grnId, r!]),
  );

  return {
    items: docs.map((d) => {
      const entity = toChallanEntity(d);
      const grn = grnMap.get(d.grnId);
      const bal = balanceMap.get(d.grnId);
      const rent = rentMap.get(d.grnId);

      return {
        ...entity,
        originalBags: grn ? grn.bags : undefined,
        remainingSmallBags: bal ? bal.smallBags : undefined,
        remainingBigBags: bal ? bal.bigBags : undefined,
        remainingTotalBags: bal ? bal.total : undefined,
        rentPaymentStatus: rent ? rent.paymentStatus : undefined,
        rentRemainingBalance: rent ? rent.remainingBalance : undefined,
        rentTotalAmount: rent ? rent.rentAmount : undefined,
        rentTotalPaid: rent ? rent.totalPaid : undefined,
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
  return docs.map((d) => toChallanEntity(d));
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
