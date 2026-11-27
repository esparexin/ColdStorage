import type { TransferDeedDocumentDto } from '@cold-storage/contracts';
import { GrnModel } from '../../database/models/grn.model.js';
import { InternalMovementModel } from '../../database/models/internal-movement.model.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';
import {
  getFacilitySubHeader,
  getVerifiedOrganization,
} from './document-headers.helper.js';

export async function buildTransferDeedDto(
  facilityId: string,
  movementId: string,
  userId: string,
): Promise<TransferDeedDocumentDto> {
  const organization = await getVerifiedOrganization();
  const facility = await getFacilitySubHeader(facilityId);

  const movement = await InternalMovementModel.findOne({ id: movementId, facilityId }).lean().exec();
  if (!movement) {
    throw new Error('MOVEMENT_NOT_FOUND: Ownership transfer movement not found');
  }
  if (movement.movementType !== 'TRANSFER_OWNERSHIP') {
    throw new Error('INVALID_MOVEMENT_TYPE: Specified movement is not an ownership transfer');
  }

  const grn = await GrnModel.findOne({ id: movement.grnId || movement.targetGrnId, facilityId }).lean().exec();
  if (!grn) {
    throw new Error('GRN_NOT_FOUND: GRN record not found for transfer movement');
  }

  const payment = await RentPaymentModel.findOne({
    facilityId,
    grnId: grn.id,
    paymentDate: movement.movementDate,
  }).sort({ createdAt: -1 }).lean().exec();

  const isSettledNow = movement.financialSnapshot.remainingBalance === 0 || movement.financialSnapshot.totalPaid > 0;
  const isHybrid = movement.resultingBagType === 'Hybrid' || grn.bagType === 'Hybrid';

  return {
    organization,
    facility,
    transferInvoiceNumber: movement.transferInvoiceNumber || `TRF-INV-GEN-${movement.id.slice(-4)}`,
    movementDate: movement.movementDate,
    grnNumber: grn.grnNumber,
    commodityName: grn.commodityName,
    chamber: movement.destinationChamber || grn.chamber,
    storageMark: grn.storageMark || grn.grnNumber,
    partyMark: grn.partyMark || null,
    sellerId: movement.fromCustomerId || 'N/A',
    sellerName: movement.fromCustomerName || 'Previous Owner',
    buyerId: movement.toCustomerId || grn.customerId,
    buyerName: movement.toCustomerName || grn.customerName,
    transferredBags: movement.totalBagsMoved || grn.bags,
    smallBags: movement.smallBagsMoved || 0,
    bigBags: movement.bigBagsMoved || 0,
    bagType: movement.resultingBagType || grn.bagType,
    isHybrid,
    transferFeeCharged: movement.transferFeeCharged || 0,
    feePayer: movement.feePayer || null,
    repackHamaliCharge: movement.hamaliCharge ?? 0,
    repackHamaliRate: movement.hamaliRate ?? 0,
    repackHamaliBags: movement.hamaliBags ?? 0,
    paymentDecision: isSettledNow ? 'SETTLE_NOW' : 'AGREED_PENDING',
    settledAmount: payment?.amountPaid ?? (movement.financialSnapshot.totalPaid || 0),
    rentReceiptNumber: payment?.receiptNumber || null,
    carriedRentAmount: movement.financialSnapshot.remainingBalance || 0,
    totalRentObligation: movement.financialSnapshot.rentAmount || 0,
    remarks: movement.remarks || null,
    generatedAt: new Date(),
    generatedBy: userId,
  };
}
