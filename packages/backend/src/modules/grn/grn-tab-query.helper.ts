import { type GrnProfileTab, type RentType, resolveTotalRentObligation } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { ledgerSignedComposition } from '../inventory/ledger-polarity.js';

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
  const [deliveryAgg, paymentAgg, facilityGrns, ledgerAgg] = await Promise.all([
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
      .select('id bags status mergedIntoGrnId mergedIntoGrnNumber rentAmount rentType remarks')
      .lean()
      .exec(),
    InventoryTransactionModel.aggregate<{ _id: string; small: number; big: number }>([
      { $match: { facilityId } },
      {
        $group: {
          _id: '$grnId',
          small: { $sum: ledgerSignedComposition.small },
          big: { $sum: ledgerSignedComposition.big },
        },
      },
    ]),
  ]);

  const deliveredMap = new Map<string, number>(deliveryAgg.map((d) => [d._id, d.totalDelivered]));
  const rentChargeMap = new Map<string, number>(deliveryAgg.map((d) => [d._id, d.totalRentCharge]));
  const paymentMap = new Map<string, number>(paymentAgg.map((p) => [p._id, p.totalPaid]));
  const ledgerMap = new Map<string, number>(
    ledgerAgg.map((l) => [
      String(l._id),
      Number(l.small ?? 0) + Number(l.big ?? 0),
    ]),
  );
  const rentBalanceMap = new Map<string, GrnTabRentSummary>();

  const activeIds: string[] = [];
  const partialIds: string[] = [];
  const pendingPaymentIds: string[] = [];
  const closedIds: string[] = [];
  const mergedIds: string[] = [];
  const zeroBalanceIdsToClose: string[] = [];

  for (const grn of facilityGrns) {
    const isMergedSource = Boolean(grn.mergedIntoGrnId || grn.mergedIntoGrnNumber);
    const isMergedTarget = Boolean(grn.remarks && grn.remarks.includes('[MERGE RECEIVED'));
    const isMerged = isMergedSource || isMergedTarget;

    const delivered = deliveredMap.get(grn.id) ?? 0;
    const rawLedger = ledgerMap.get(grn.id);
    const closing = isMergedSource
      ? 0
      : (rawLedger !== undefined && rawLedger >= 0 ? rawLedger : Math.max(0, grn.bags - delivered));

    const outwardRent = rentChargeMap.get(grn.id) ?? 0;
    const totalPaid = paymentMap.get(grn.id) ?? 0;

    const effectiveLiability = resolveTotalRentObligation({
      rentType: (grn.rentType ?? 'Seasonal') as RentType,
      rentAmount: grn.rentAmount,
      outwardRentCharges: outwardRent,
    });
    const remainingLiability = Math.max(0, Number((effectiveLiability - totalPaid).toFixed(2)));
    const paymentStatus: 'Settled' | 'Not Settled' = remainingLiability === 0 ? 'Settled' : 'Not Settled';
    rentBalanceMap.set(grn.id, { remainingBalance: remainingLiability, paymentStatus });

    // Self-healing: merged source lots or settled zero-balance lots should be marked CLOSED in DB
    if (((isMergedSource && closing === 0) || (closing === 0 && remainingLiability === 0)) && grn.status !== 'CLOSED') {
      zeroBalanceIdsToClose.push(grn.id);
    }

    // Merged tab: strictly displays merged consignments with remaining active stock (> 0 bags).
    // Zero-balance GRNs (whether merged source lots or outwarded lots) must never appear in the Merged tab.
    if (isMerged && closing > 0 && grn.status !== 'CLOSED') {
      mergedIds.push(grn.id);
    }

    // Closed tab: once balance reaches 0 bags with no dues, or status is CLOSED, or merged source lot, it belongs in Closed.
    if (grn.status === 'CLOSED' || (closing === 0 && remainingLiability === 0) || (isMergedSource && closing === 0)) {
      closedIds.push(grn.id);
      continue;
    }

    if (closing === 0 && remainingLiability > 0) {
      pendingPaymentIds.push(grn.id);
      continue;
    }

    // Status is 'OPEN' and stock is remaining (> 0 bags)
    if (delivered === 0 && closing > 0) {
      activeIds.push(grn.id);
    } else if (closing > 0) {
      partialIds.push(grn.id);
    }

    if (remainingLiability > 0) {
      pendingPaymentIds.push(grn.id);
    }
  }

  if (zeroBalanceIdsToClose.length > 0) {
    void GrnModel.updateMany(
      { id: { $in: zeroBalanceIdsToClose }, status: { $ne: 'CLOSED' } },
      { $set: { status: 'CLOSED', updatedAt: new Date() } },
    ).catch(() => {});
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
