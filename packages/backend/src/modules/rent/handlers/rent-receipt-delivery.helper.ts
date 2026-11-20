import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { resolveCreditedChallansForPayment } from '../../delivery/handlers/delivery-settlement-reconciliation.helper.js';

export interface ResolvedReceiptDeliveryInfo {
  challanNumber?: string;
  gpNumber?: string;
  deliveryDate?: Date;
  deliveryBags?: number;
  deliveryObligation?: number;
  deliveryRemaining?: number;
  traceDetails?: string;
}

export interface PaymentDeliveryContext {
  paymentId?: string;
  grnId?: string;
}

export async function resolveReceiptDeliveryInfo(
  facilityId: string,
  deliveryId: string | null | undefined,
  fallbackChallanNumber?: string | null,
  fallbackGpNumber?: string | null,
  paymentContext?: PaymentDeliveryContext,
): Promise<ResolvedReceiptDeliveryInfo> {
  let challanNumber = fallbackChallanNumber ?? undefined;
  let gpNumber = fallbackGpNumber ?? undefined;
  let deliveryDate: Date | undefined;
  let deliveryBags: number | undefined;
  let deliveryObligation: number | undefined;
  let deliveryRemaining: number | undefined;
  let traceDetails: string | undefined;

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
  } else if (paymentContext?.grnId && paymentContext?.paymentId) {
    const [challanDocs, payments] = await Promise.all([
      DeliveryChallanModel.find({ facilityId, grnId: paymentContext.grnId, status: 'ISSUED' }).lean(),
      RentPaymentModel.find({ facilityId, grnId: paymentContext.grnId }).lean(),
    ]);

    const credited = resolveCreditedChallansForPayment(paymentContext.paymentId, challanDocs, payments);

    if (credited.length > 0) {
      const challanDocMap = new Map(challanDocs.map((c) => [c.id, c]));
      challanNumber = credited.map((c) => c.challanNumber || c.id).join(', ');
      gpNumber = credited.map((c) => c.gpNumber).filter(Boolean).join(', ') || undefined;

      const latestTime = Math.max(...credited.map((c) => new Date(c.date).getTime()));
      deliveryDate = new Date(latestTime);

      let totalBags = 0;
      let totalObligation = 0;
      for (const c of credited) {
        const doc = challanDocMap.get(c.id);
        if (doc) totalBags += (doc.smallBags ?? 0) + (doc.bigBags ?? 0);
        totalObligation += c.rentCharge;
      }
      deliveryBags = totalBags;
      deliveryObligation = Number(totalObligation.toFixed(2));

      const breakdown = credited.map((c) => `${c.challanNumber || c.id}: ₹${c.amountCredited.toLocaleString('en-IN')}`).join(', ');
      traceDetails = `Consolidated Settlement: ${credited.length} Gate Pass${credited.length > 1 ? 'es' : ''} (${breakdown})`;
    }
  }

  return { challanNumber, gpNumber, deliveryDate, deliveryBags, deliveryObligation, deliveryRemaining, traceDetails };
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

