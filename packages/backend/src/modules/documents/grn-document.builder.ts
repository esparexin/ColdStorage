import type { GrnDocumentDto, ReceiptDocumentDto } from '@cold-storage/contracts';
import { GrnModel } from '../../database/models/grn.model.js';
import {
  getFacilitySubHeader,
  getVerifiedOrganization,
} from './document-headers.helper.js';

export async function buildGrnDocumentDto(
  facilityId: string,
  grnId: string,
  userId: string,
): Promise<GrnDocumentDto> {
  const organization = await getVerifiedOrganization();
  const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
  if (!grn) {
    throw new Error('GRN_NOT_FOUND: GRN record not found');
  }
  if (grn.facilityId !== facilityId) {
    throw new Error('FACILITY_MISMATCH: Document does not belong to the requested facility');
  }
  const facility = await getFacilitySubHeader(facilityId);

  return {
    organization,
    facility,
    grnId: grn.id,
    grnNumber: grn.grnNumber,
    inwardReceiptNumber: grn.inwardReceiptNumber,
    date: grn.date,
    customerName: grn.customerName,
    commodityName: grn.commodityName,
    chamber: grn.chamber,
    bags: grn.bags,
    bagType: grn.bagType,
    smallBags: grn.smallBags,
    bigBags: grn.bigBags,
    rentType: grn.rentType,
    rentAmount: grn.rentAmount,
    rentMonths: grn.rentMonths ?? null,
    smallBagWeight: grn.smallBagWeight ?? null,
    bigBagWeight: grn.bigBagWeight ?? null,
    vehicleNumber: grn.vehicleNumber ?? null,
    gpNumber: grn.gpNumber ?? null,
    marks: grn.marks ?? null,
    partyMark: grn.partyMark ?? null,
    status: grn.status,
    generatedAt: new Date(),
    generatedBy: userId,
  };
}

export async function buildReceiptDocumentDto(
  facilityId: string,
  grnId: string,
  userId: string,
): Promise<ReceiptDocumentDto> {
  const organization = await getVerifiedOrganization();
  const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
  if (!grn) {
    throw new Error('GRN_NOT_FOUND: GRN record not found');
  }
  if (grn.facilityId !== facilityId) {
    throw new Error('FACILITY_MISMATCH: Document does not belong to the requested facility');
  }
  const facility = await getFacilitySubHeader(facilityId);

  return {
    organization,
    facility,
    inwardReceiptNumber: grn.inwardReceiptNumber,
    grnNumber: grn.grnNumber,
    date: grn.date,
    customerName: grn.customerName,
    commodityName: grn.commodityName,
    chamber: grn.chamber,
    bags: grn.bags,
    bagType: grn.bagType,
    smallBags: grn.smallBags,
    bigBags: grn.bigBags,
    smallBagWeight: grn.smallBagWeight ?? null,
    bigBagWeight: grn.bigBagWeight ?? null,
    totalBagsWeight: grn.totalBagsWeight ?? null,
    smallBagPrice: grn.smallBagPrice ?? null,
    bigBagPrice: grn.bigBagPrice ?? null,
    storageMark: grn.storageMark || grn.grnNumber,
    rentType: grn.rentType,
    rentAmount: grn.rentAmount,
    rentMonths: grn.rentMonths ?? null,
    partyMark: grn.partyMark ?? null,
    vehicleNumber: grn.vehicleNumber ?? null,
    generatedAt: new Date(),
    generatedBy: userId,
  };
}
