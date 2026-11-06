import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';

export interface ResolvedReceiptDeliveryInfo {
  challanNumber?: string;
  gpNumber?: string;
  deliveryDate?: Date;
  deliveryBags?: number;
  deliveryObligation?: number;
  deliveryRemaining?: number;
}

export async function resolveReceiptDeliveryInfo(
  facilityId: string,
  deliveryId: string | null | undefined,
  fallbackChallanNumber?: string | null,
  fallbackGpNumber?: string | null,
): Promise<ResolvedReceiptDeliveryInfo> {
  let challanNumber = fallbackChallanNumber ?? undefined;
  let gpNumber = fallbackGpNumber ?? undefined;
  let deliveryDate: Date | undefined;
  let deliveryBags: number | undefined;
  let deliveryObligation: number | undefined;
  let deliveryRemaining: number | undefined;

  if (deliveryId) {
    const delDoc = await DeliveryChallanModel.findOne({ id: deliveryId, facilityId }).lean();
    if (delDoc) {
      challanNumber = delDoc.challanNumber;
      gpNumber = delDoc.gpNumber ?? undefined;
      deliveryDate = delDoc.date;
      deliveryBags = (delDoc.smallBags ?? 0) + (delDoc.bigBags ?? 0);
      deliveryObligation = delDoc.rentCharge ?? 0;
      const allDelPayments = await RentPaymentModel.find({ facilityId, deliveryId: delDoc.id }).lean();
      const delPaid = allDelPayments.reduce((s, p) => s + p.amountPaid, 0);
      deliveryRemaining = Math.max(0, Number(((delDoc.rentCharge ?? 0) - delPaid).toFixed(2)));
    }
  }

  return { challanNumber, gpNumber, deliveryDate, deliveryBags, deliveryObligation, deliveryRemaining };
}

export interface ResolvedReceiptOperationInfo {
  movementType?: string;
  operationDescription?: string;
  traceDetails?: string;
}

export function resolveReceiptOperationInfo(notes?: string | null, grnNumber?: string): ResolvedReceiptOperationInfo {
  const n = (notes || '').toLowerCase();
  if (n.includes('transfer')) {
    return {
      movementType: 'TRANSFER_OWNERSHIP',
      operationDescription: notes || 'Ownership Transfer Settlement',
      traceDetails: `Audit Trace: Op=TRANSFER_OWNERSHIP | Lot=${grnNumber || '—'}`,
    };
  }
  if (n.includes('sorting') || n.includes('repack')) {
    return {
      movementType: 'SORTING_REPACKING',
      operationDescription: notes || 'Sorting & Repacking Settlement',
      traceDetails: `Audit Trace: Op=SORTING_REPACKING | Lot=${grnNumber || '—'}`,
    };
  }
  if (n.includes('merge')) {
    return {
      movementType: 'MERGE',
      operationDescription: notes || 'Merge Settlement',
      traceDetails: `Audit Trace: Op=MERGE | Lot=${grnNumber || '—'}`,
    };
  }
  return {};
}

