import {
  type MergeShiftingInvoiceDocumentDto,
  type MergeSourceLotSummary,
} from '@cold-storage/contracts';
import { GrnModel } from '../../database/models/grn.model.js';
import { InternalMovementModel } from '../../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';
import {
  getFacilitySubHeader,
  getVerifiedOrganization,
} from './document-headers.helper.js';

export async function buildMergeShiftingInvoiceDto(
  facilityId: string,
  movementId: string,
  userId: string,
): Promise<MergeShiftingInvoiceDocumentDto> {
  const organization = await getVerifiedOrganization();
  const facility = await getFacilitySubHeader(facilityId);

  const movement = await InternalMovementModel.findOne({ id: movementId, facilityId }).lean().exec();
  if (!movement) {
    throw new Error('MOVEMENT_NOT_FOUND: Merge internal movement record not found');
  }
  if (movement.movementType !== 'MERGE') {
    throw new Error('INVALID_MOVEMENT_TYPE: Specified movement is not a consignment merge movement');
  }

  const targetGrn = await GrnModel.findOne({ id: movement.targetGrnId, facilityId }).lean().exec();
  if (!targetGrn) {
    throw new Error('GRN_NOT_FOUND: Target surviving GRN record not found');
  }

  const sourceGrnIds = movement.sourceGrnIds || [];
  const sourceGrns = await GrnModel.find({ id: { $in: sourceGrnIds }, facilityId }).lean().exec();

  const sourceTxs = await InventoryTransactionModel.find({
    facilityId,
    referenceId: { $in: sourceGrnIds.map((id) => `${movement.id}-${id}`) },
  }).lean().exec();

  const sourceLots: MergeSourceLotSummary[] = sourceGrns.map((s) => {
    const tx = sourceTxs.find((t) => t.grnId === s.id);
    const movedSmall = tx?.smallQuantity ?? (s.smallBags || 0);
    const movedBig = tx?.bigQuantity ?? (s.bigBags || 0);
    const movedTotal = tx ? movedSmall + movedBig : (s.bags > 0 ? s.bags : 1);
    return {
      grnId: s.id,
      grnNumber: s.grnNumber,
      customerName: s.customerName,
      originalChamber: s.chamber || 'N/A',
      movedBags: movedTotal > 0 ? movedTotal : 1,
      smallBags: movedSmall,
      bigBags: movedBig,
      bagType: s.bagType || 'S/B',
      pendingRentSettled: s.rentAmount ?? 0,
    };
  });

  const survivingBags = targetGrn.bags > 0 ? targetGrn.bags : movement.totalBagsMoved;
  const survivingSmallBags = targetGrn.smallBags ?? movement.smallBagsMoved ?? 0;
  const survivingBigBags = targetGrn.bigBags ?? movement.bigBagsMoved ?? 0;
  const resultingBagType = movement.resultingBagType || targetGrn.bagType || 'S/B';
  const destinationChamber = movement.destinationChamber || targetGrn.chamber || 'N/A';

  const hamaliPayment = await RentPaymentModel.findOne({
    facilityId,
    grnId: targetGrn.id,
    notes: { $regex: /Consignment Merge Hamali Labor/i },
  }).sort({ createdAt: -1 }).lean().exec();

  return {
    organization,
    facility,
    mergeInvoiceNumber: movement.mergeInvoiceNumber || `MSH-INV-GEN-${movement.id.slice(-4)}`,
    movementDate: movement.movementDate,
    targetGrnId: targetGrn.id,
    targetGrnNumber: targetGrn.grnNumber,
    customerName: targetGrn.customerName,
    customerId: targetGrn.customerId,
    commodityName: targetGrn.commodityName,
    destinationChamber,
    storageMark: targetGrn.storageMark || targetGrn.grnNumber,
    partyMark: targetGrn.partyMark || null,
    survivingBags,
    survivingSmallBags,
    survivingBigBags,
    resultingBagType,
    totalMergedBags: movement.totalBagsMoved > 0 ? movement.totalBagsMoved : 1,
    sourceLots,
    repackHamaliCharge: movement.hamaliCharge ?? 0,
    repackHamaliRate: movement.hamaliRate ?? 0,
    hamaliReceiptNumber: hamaliPayment?.receiptNumber ?? null,
    repackVariance: movement.repackVariance ?? 0,
    carriedRentAmount: movement.carriedRentAmount ?? 0,
    totalDueAtMerge: movement.financialSnapshot?.remainingBalance ?? 0,
    totalPaidAtMerge: movement.financialSnapshot?.totalPaid ?? 0,
    remarks: movement.remarks || null,
    generatedAt: new Date(),
    generatedBy: userId,
  };
}
