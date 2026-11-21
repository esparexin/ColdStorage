import type { SortingInvoiceDocumentDto } from '@cold-storage/contracts';
import { GrnModel } from '../../database/models/grn.model.js';
import { InternalMovementModel } from '../../database/models/internal-movement.model.js';
import {
  getFacilitySubHeader,
  getVerifiedOrganization,
} from './document-headers.helper.js';

export async function buildSortingInvoiceDto(
  facilityId: string,
  movementId: string,
  userId: string,
): Promise<SortingInvoiceDocumentDto> {
  const organization = await getVerifiedOrganization();
  const facility = await getFacilitySubHeader(facilityId);

  const movement = await InternalMovementModel.findOne({ id: movementId, facilityId }).lean().exec();
  if (!movement) {
    throw new Error('MOVEMENT_NOT_FOUND: Sorting and repacking movement not found');
  }
  if (movement.movementType !== 'REPACK') {
    throw new Error('INVALID_MOVEMENT_TYPE: Specified movement is not a sorting or repacking movement');
  }

  const grn = await GrnModel.findOne({ id: movement.targetGrnId || movement.grnId, facilityId }).lean().exec();
  if (!grn) {
    throw new Error('GRN_NOT_FOUND: GRN record not found for repacking movement');
  }

  const repackedBags = movement.totalBagsMoved;
  const variance = movement.repackVariance ?? 0;
  const originalBags = movement.repackSourceBags && movement.repackSourceBags > 0
    ? movement.repackSourceBags
    : repackedBags - variance;

  const originalBagType = movement.sourceBagType || grn.bagType || 'S/B';
  const resultingBagType = movement.resultingBagType || grn.bagType || 'S/B';

  const sortingLaborCharge = movement.sortingLaborCharge ?? movement.hamaliCharge ?? 0;
  const sortingLaborRate = movement.hamaliRate ?? 0;
  const bardanaCharge = movement.bardanaCharge ?? 0;
  const newBagsSupplied = movement.newBagsSupplied ?? 0;
  const newBagRate = movement.newBagRate ?? 0;
  const totalServiceCharge = movement.totalServiceCharge && movement.totalServiceCharge > 0
    ? movement.totalServiceCharge
    : sortingLaborCharge + bardanaCharge;

  return {
    organization,
    facility,
    sortingInvoiceNumber: movement.sortingInvoiceNumber || `SRT-INV-GEN-${movement.id.slice(-4)}`,
    movementDate: movement.movementDate,
    grnNumber: grn.grnNumber,
    commodityName: grn.commodityName,
    chamber: movement.destinationChamber || grn.chamber,
    storageMark: grn.storageMark || grn.grnNumber,
    partyMark: grn.partyMark || null,
    customerId: grn.customerId,
    customerName: grn.customerName,
    originalBags,
    originalSmallBags: originalBagType === 'Hybrid' ? 0 : originalBags,
    originalBigBags: 0,
    originalBagType,
    repackedBags,
    repackedSmallBags: movement.smallBagsMoved || 0,
    repackedBigBags: movement.bigBagsMoved || 0,
    resultingBagType,
    variance,
    varianceReason: movement.remarks?.includes('(Variance:')
      ? movement.remarks.replace(/.*\((Variance:\s*[^)]+)\).*/, '$1')
      : null,
    sortingLaborRate,
    sortingLaborCharge,
    newBagsSupplied,
    newBagRate,
    bardanaCharge,
    totalServiceCharge,
    remarks: movement.remarks || null,
    generatedAt: new Date(),
    generatedBy: userId,
  };
}
