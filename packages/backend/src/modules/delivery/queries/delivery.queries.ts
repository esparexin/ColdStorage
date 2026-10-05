import type { DeliveryChallan, DeliveryQuery, DeliverySummary } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
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

  return {
    items: docs.map((d) => toChallanEntity(d)),
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
  const [grn, issuedAgg, challanDocs] = await Promise.all([
    GrnModel.findOne({ id: grnId, facilityId }).lean().exec(),
    DeliveryChallanModel.aggregate([
      { $match: { grnId, facilityId, status: 'ISSUED' } },
      {
        $group: {
          _id: null,
          small: { $sum: '$smallBags' },
          big: { $sum: '$bigBags' },
        },
      },
    ]),
    DeliveryChallanModel.find({ facilityId, grnId })
      .sort({ date: -1, createdAt: -1 })
      .lean()
      .exec(),
  ]);

  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  const netDeliveredSmallBags = issuedAgg[0]?.small ?? 0;
  const netDeliveredBigBags = issuedAgg[0]?.big ?? 0;
  const netDeliveredBags = netDeliveredSmallBags + netDeliveredBigBags;
  const availableSmallBags = grn.smallBags - netDeliveredSmallBags;
  const availableBigBags = grn.bigBags - netDeliveredBigBags;
  const remainingDeliveryBalance = Math.max(0, availableSmallBags + availableBigBags);

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
