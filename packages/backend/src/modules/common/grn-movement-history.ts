import type { GrnMovementEntry, GrnMovementHistory } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';

/**
 * Reconstructs the canonical movement history for a GRN from the immutable ledger.
 *
 * Source of truth:
 * - GrnModel (Inward event, initial stock)
 * - InventoryTransactionModel (OUTWARD_DELIVERY & DELIVERY_REVERSAL events)
 * - DeliveryChallanModel / DeliveryReversalModel (enriching audit fields: marks, GP, challan number)
 */
export async function getGrnMovementHistory(
  facilityId: string,
  grnId: string,
): Promise<GrnMovementHistory | null> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) return null;

  const transactions = await InventoryTransactionModel.find({
    facilityId,
    grnId,
    transactionType: { $in: ['OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'] },
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean()
    .exec();

  const deliveryIds = transactions
    .filter((tx) => tx.referenceType === 'DELIVERY')
    .map((tx) => tx.referenceId);
  const reversalIds = transactions
    .filter((tx) => tx.referenceType === 'DELIVERY_REVERSAL')
    .map((tx) => tx.referenceId);

  const [challans, reversals] = await Promise.all([
    deliveryIds.length > 0
      ? DeliveryChallanModel.find({ id: { $in: deliveryIds }, facilityId }).lean().exec()
      : [],
    reversalIds.length > 0
      ? DeliveryReversalModel.find({ id: { $in: reversalIds }, facilityId }).lean().exec()
      : [],
  ]);

  const challanMap = new Map(challans.map((c) => [c.id, c]));
  const reversalMap = new Map(reversals.map((r) => [r.id, r]));

  const entries: GrnMovementEntry[] = [
    {
      date: grn.date,
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      type: 'INWARD',
      openingBags: 0,
      deliveredBags: 0,
      closingBags: grn.bags,
      marks: grn.marks ?? null,
      gpNumber: grn.gpNumber ?? null,
      vehicleNumber: grn.vehicleNumber ?? null,
      remarks: grn.remarks ?? null,
      performedBy: grn.createdBy,
    },
  ];

  let runningBalance = grn.bags;
  let netDelivered = 0;

  for (const tx of transactions) {
    if (tx.transactionType === 'OUTWARD_DELIVERY') {
      const challan = challanMap.get(tx.referenceId);
      const deliveredCount = tx.quantity;
      const opening = runningBalance;
      const closing = Math.max(0, runningBalance - deliveredCount);
      runningBalance = closing;
      netDelivered += deliveredCount;

      entries.push({
        date: tx.createdAt,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        type: closing === 0 ? 'FINAL_OUTWARD' : 'PARTIAL_OUTWARD',
        openingBags: opening,
        deliveredBags: deliveredCount,
        closingBags: closing,
        challanNumber: challan?.challanNumber ?? null,
        deliveryId: tx.referenceId,
        marks: challan?.marks ?? grn.marks ?? null,
        gpNumber: challan?.gpNumber ?? grn.gpNumber ?? null,
        vehicleNumber: challan?.vehicleNumber ?? null,
        driverName: challan?.driverName ?? null,
        remarks: challan?.remarks ?? tx.notes ?? null,
        performedBy: tx.createdBy,
      });
    } else if (tx.transactionType === 'DELIVERY_REVERSAL') {
      const reversal = reversalMap.get(tx.referenceId);
      const returnedCount = tx.quantity;
      const opening = runningBalance;
      const closing = runningBalance + returnedCount;
      runningBalance = closing;
      netDelivered -= returnedCount;

      entries.push({
        date: tx.createdAt,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        type: 'DELIVERY_REVERSAL',
        openingBags: opening,
        deliveredBags: returnedCount,
        closingBags: closing,
        challanNumber: reversal?.challanNumber ?? null,
        reversalId: tx.referenceId,
        marks: grn.marks ?? null,
        gpNumber: grn.gpNumber ?? null,
        remarks: reversal?.reason ?? tx.notes ?? null,
        performedBy: tx.createdBy,
      });
    }
  }

  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    customerId: grn.customerId,
    customerName: grn.customerName,
    commodityId: grn.commodityId,
    commodityName: grn.commodityName,
    chamber: grn.chamber,
    inwardDate: grn.date,
    totalInwardBags: grn.bags,
    netDeliveredBags: Math.max(0, netDelivered),
    currentClosingBags: runningBalance,
    status: grn.status,
    entries,
  };
}
