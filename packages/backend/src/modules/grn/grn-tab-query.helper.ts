import { type GrnProfileTab, resolveTotalRentObligation } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';
import { GrnModel } from '../../database/models/grn.model.js';

export interface GrnTabRentSummary {
  remainingBalance: number;
  paymentStatus: 'Settled' | 'Not Settled';
}

export interface GrnFacilityTabResolution {
  targetIds?: string[];
  counts: {
    all: number;
    active: number;
    partial: number;
    pendingPayment: number;
    closed: number;
    merged: number;
  };
  deliveredMap: Map<string, number>;
  rentBalanceMap: Map<string, GrnTabRentSummary>;
}

/**
 * Resolves authoritative facility-wide GRN profile tab classifications, counts,
 * and matching record IDs before pagination.
 */
export async function resolveGrnFacilityTabSummaries(
  facilityId: string,
  selectedTab?: GrnProfileTab,
): Promise<GrnFacilityTabResolution> {
  const [deliveryAgg, paymentAgg, facilityGrns] = await Promise.all([
    DeliveryChallanModel.aggregate<{ _id: string; totalDelivered: number; totalRentCharge: number }>([
      { $match: { facilityId, status: 'ISSUED' } },
      {
        $group: {
          _id: '$grnId',
          totalDelivered: { $sum: { $add: ['$smallBags', '$bigBags'] } },
          totalRentCharge: { $sum: '$rentCharge' },
        },
      },
    ]),
    RentPaymentModel.aggregate<{ _id: string; totalPaid: number }>([
      { $match: { facilityId } },
      { $group: { _id: '$grnId', totalPaid: { $sum: '$amountPaid' } } },
    ]),
    GrnModel.find({ facilityId })
      .select('id bags status mergedIntoGrnId rentAmount rentType remarks')
      .lean()
      .exec(),
  ]);

  const deliveredMap = new Map<string, number>(deliveryAgg.map((d) => [d._id, d.totalDelivered]));
  const rentChargeMap = new Map<string, number>(deliveryAgg.map((d) => [d._id, d.totalRentCharge]));
  const paymentMap = new Map<string, number>(paymentAgg.map((p) => [p._id, p.totalPaid]));
  const rentBalanceMap = new Map<string, GrnTabRentSummary>();

  const activeIds: string[] = [];
  const partialIds: string[] = [];
  const pendingPaymentIds: string[] = [];
  const closedIds: string[] = [];
  const mergedIds: string[] = [];

  for (const grn of facilityGrns) {
    const isMergedSource = Boolean(grn.mergedIntoGrnId);
    const isMergedTarget = Boolean(grn.remarks && grn.remarks.includes('[MERGE RECEIVED'));

    if (isMergedSource) {
      mergedIds.push(grn.id);
      continue;
    }
    if (isMergedTarget) {
      mergedIds.push(grn.id);
    }

    const delivered = deliveredMap.get(grn.id) ?? 0;
    const remaining = Math.max(0, grn.bags - delivered);
    const outwardRent = rentChargeMap.get(grn.id) ?? 0;
    const totalPaid = paymentMap.get(grn.id) ?? 0;

    const effectiveLiability = resolveTotalRentObligation({
      rentType: (grn.rentType ?? 'Seasonal') as 'Monthly' | 'Seasonal' | 'Seasonal_3M',
      rentAmount: grn.rentAmount,
      outwardRentCharges: outwardRent,
    });
    const remainingLiability = Math.max(0, Number((effectiveLiability - totalPaid).toFixed(2)));
    const paymentStatus: 'Settled' | 'Not Settled' = remainingLiability === 0 ? 'Settled' : 'Not Settled';
    rentBalanceMap.set(grn.id, { remainingBalance: remainingLiability, paymentStatus });

    if (grn.status === 'CLOSED') {
      closedIds.push(grn.id);
      continue;
    }

    // Status is 'OPEN'
    if (delivered === 0) {
      activeIds.push(grn.id);
    } else {
      if (remaining > 0) {
        partialIds.push(grn.id);
      }
      if (remainingLiability > 0 || remaining === 0) {
        pendingPaymentIds.push(grn.id);
      }
    }
  }

  const counts = {
    all: facilityGrns.length,
    active: activeIds.length,
    partial: partialIds.length,
    pendingPayment: pendingPaymentIds.length,
    closed: closedIds.length,
    merged: mergedIds.length,
  };

  let targetIds: string[] | undefined;
  if (selectedTab === 'ACTIVE') {
    targetIds = activeIds;
  } else if (selectedTab === 'PARTIAL') {
    targetIds = partialIds;
  } else if (selectedTab === 'PENDING_PAYMENT') {
    targetIds = pendingPaymentIds;
  } else if (selectedTab === 'CLOSED') {
    targetIds = closedIds;
  } else if (selectedTab === 'MERGED') {
    targetIds = mergedIds;
  }

  return {
    targetIds,
    counts,
    deliveredMap,
    rentBalanceMap,
  };
}
