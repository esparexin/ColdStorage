import type {
  ChallanDocumentDto,
  GrnDocumentDto,
  ReceiptDocumentDto,
  RentReceiptPreviewDto,
} from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import {
  getFacilitySubHeader,
  getVerifiedOrganization,
} from './document-headers.helper.js';
import { renderChallanTemplate } from './templates/challan.template.js';
import { renderGrnTemplate } from './templates/grn.template.js';
import { renderReceiptTemplate } from './templates/receipt.template.js';
import { renderRentReceiptTemplate } from './templates/rent-receipt.template.js';

export class DocumentService {

  /**
   * 1. Renders GRN Storage Record HTML document.
   * Read-only composition layer; zero mutations; zero counter allocations.
   */
  public async renderGrnDocument(
    facilityId: string,
    grnId: string,
    userId: string,
  ): Promise<string> {
    const organization = await getVerifiedOrganization();

    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    if (!grn) {
      throw new Error('GRN_NOT_FOUND: GRN record not found');
    }

    // Document-level facility ownership validation
    if (grn.facilityId !== facilityId) {
      throw new Error('FACILITY_MISMATCH: Document does not belong to the requested facility');
    }

    const facility = await getFacilitySubHeader(facilityId);

    const dto: GrnDocumentDto = {
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
      status: grn.status,
      generatedAt: new Date(),
      generatedBy: userId,
    };

    return renderGrnTemplate(dto);
  }

  /**
   * 2. Renders Farmer Inward Acknowledgement Receipt HTML document.
   */
  public async renderReceiptDocument(
    facilityId: string,
    grnId: string,
    userId: string,
  ): Promise<string> {
    const organization = await getVerifiedOrganization();

    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    if (!grn) {
      throw new Error('GRN_NOT_FOUND: GRN record not found');
    }

    // Document-level facility ownership validation
    if (grn.facilityId !== facilityId) {
      throw new Error('FACILITY_MISMATCH: Document does not belong to the requested facility');
    }

    const facility = await getFacilitySubHeader(facilityId);

    const dto: ReceiptDocumentDto = {
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
      rentType: grn.rentType,
      rentAmount: grn.rentAmount,
      rentMonths: grn.rentMonths ?? null,
      vehicleNumber: grn.vehicleNumber ?? null,
      generatedAt: new Date(),
      generatedBy: userId,
    };

    return renderReceiptTemplate(dto);
  }

  /**
   * 3. Renders Outward Delivery Challan HTML document.
   */
  public async renderChallanDocument(
    facilityId: string,
    challanId: string,
    userId: string,
  ): Promise<string> {
    const organization = await getVerifiedOrganization();

    const challan = await DeliveryChallanModel.findOne({ id: challanId }).lean().exec();
    if (!challan) {
      throw new Error('CHALLAN_NOT_FOUND: Delivery Challan record not found');
    }

    // Document-level facility ownership validation
    if (challan.facilityId !== facilityId) {
      throw new Error('FACILITY_MISMATCH: Document does not belong to the requested facility');
    }

    const facility = await getFacilitySubHeader(facilityId);

    const dto: ChallanDocumentDto = {
      organization,
      facility,
      challanNumber: challan.challanNumber,
      date: challan.date,
      grnNumber: challan.grnNumber,
      customerName: challan.customerName,
      commodityName: challan.commodityName,
      chamber: challan.chamber,
      smallBags: challan.smallBags,
      bigBags: challan.bigBags,
      totalBags: challan.smallBags + challan.bigBags,
      vehicleNumber: challan.vehicleNumber ?? null,
      driverName: challan.driverName ?? null,
      issuedBy: challan.issuedBy,
      status: challan.status,
      generatedAt: new Date(),
      generatedBy: userId,
    };

    return renderChallanTemplate(dto);
  }

  /**
   * 4. Renders Rent Receipt Preview HTML document (Phase 9 preview boundary).
   * Generates ZERO payment records, modifies ZERO balances, allocates ZERO receipt numbers.
   */
  public async renderRentReceiptPreview(
    facilityId: string,
    userId: string,
    overrides?: {
      customerName?: string;
      amount?: number;
      paymentMode?: 'Cash' | 'UPI';
    },
  ): Promise<string> {
    const organization = await getVerifiedOrganization();
    const facility = await getFacilitySubHeader(facilityId);

    const amountPaid = overrides?.amount ?? 10000;
    const totalRentObligation = 25000;
    const remainingBalance = Math.max(0, totalRentObligation - amountPaid);

    const dto: RentReceiptPreviewDto = {
      organization,
      facility,
      receiptNumber: 'PREVIEW-RRCPT-0001',
      grnNumber: 'GRN-SAMPLE-0001',
      date: new Date(),
      customerName: overrides?.customerName ?? 'Sample Customer (Preview)',
      commodityName: 'Potato (Preview)',
      chamber: 'CH-01',
      totalRentObligation,
      amountPaid,
      paymentMode: overrides?.paymentMode === 'UPI' ? 'UPI' : 'Cash',
      remainingBalance,
      paymentStatus: remainingBalance === 0 ? 'Settled' : 'Not Settled',
      isPreview: true,
      generatedAt: new Date(),
      generatedBy: userId,
    };

    return renderRentReceiptTemplate(dto);
  }
}

export const documentService = new DocumentService();
