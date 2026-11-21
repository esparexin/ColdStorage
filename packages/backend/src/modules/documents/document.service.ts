import type {
  ChallanDocumentDto,
  RentReceiptPreviewDto,
} from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { computeRentBalance } from '../common/rent-balance.js';
import {
  getFacilitySubHeader,
  getVerifiedOrganization,
} from './document-headers.helper.js';
import { renderChallanTemplate } from './templates/challan.template.js';
import { renderGrnTemplate } from './templates/grn.template.js';
import { renderReceiptTemplate } from './templates/receipt.template.js';
import { renderRentReceiptTemplate } from './templates/rent-receipt.template.js';
import { renderTransferDeedTemplate } from './templates/transfer-deed.template.js';
import { renderSortingInvoiceTemplate } from './templates/sorting-invoice.template.js';
import { renderMergeShiftingInvoiceTemplate } from './templates/merge-shifting-invoice.template.js';
import { buildTransferDeedDto } from './transfer-deed.builder.js';
import { buildSortingInvoiceDto } from './sorting-invoice.builder.js';
import { buildMergeShiftingInvoiceDto } from './merge-shifting-invoice.builder.js';
import { buildGrnDocumentDto, buildReceiptDocumentDto } from './grn-document.builder.js';

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
    const dto = await buildGrnDocumentDto(facilityId, grnId, userId);
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
    const dto = await buildReceiptDocumentDto(facilityId, grnId, userId);
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

    const [facility, grn] = await Promise.all([
      getFacilitySubHeader(facilityId),
      GrnModel.findOne({ id: challan.grnId, facilityId }).lean().exec(),
    ]);

    const dto: ChallanDocumentDto = {
      organization,
      facility,
      challanNumber: challan.challanNumber,
      date: challan.date,
      grnNumber: challan.grnNumber,
      customerName: challan.customerName,
      commodityName: challan.commodityName,
      chamber: challan.chamber,
      bagType: (challan.bagType || grn?.bagType || 'S/B') as ChallanDocumentDto['bagType'],
      bagCategory: challan.bagCategory || undefined,
      bagPrice: challan.bagPrice ?? null,
      seasonalBagPrice: challan.seasonalBagPrice ?? null,
      monthlyBagPrice: challan.monthlyBagPrice ?? null,
      partyMark: grn?.partyMark || challan.marks || null,
      gpNumber: challan.gpNumber ?? null,
      smallBags: challan.smallBags,
      bigBags: challan.bigBags,
      totalBags: challan.smallBags + challan.bigBags,
      totalBagsWeight: grn?.totalBagsWeight ?? null,
      weight: challan.weight ?? null,
      vehicleNumber: challan.vehicleNumber ?? null,
      driverName: challan.driverName ?? null,
      issuedBy: challan.issuedBy,
      status: challan.status,
      rentCharge: challan.rentCharge,
      generatedAt: new Date(),
      generatedBy: userId,
    };

    return renderChallanTemplate(dto);
  }

  /**
   * 4. Renders Rent Receipt Preview HTML document (Phase 9 preview boundary).
   * Generates ZERO payment records, modifies ZERO balances, allocates ZERO receipt numbers.
   * Sample constants below (PREVIEW-RRCPT-0001, GRN-SAMPLE-0001, Potato/CH-01,
   * 25000/10000) are intentional preview fixtures only, never persisted (F21).
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
    const previewBalance = computeRentBalance(totalRentObligation, amountPaid);
    const remainingBalance = previewBalance.remainingBalance;

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
      paymentStatus: previewBalance.paymentStatus,
      isPreview: true,
      generatedAt: new Date(),
      generatedBy: userId,
    };

    return renderRentReceiptTemplate(dto);
  }

  /**
   * 5. Renders Ownership Transfer Deed & Settlement Invoice HTML document.
   */
  public async renderTransferDeedDocument(
    facilityId: string,
    movementId: string,
    userId: string,
  ): Promise<string> {
    const dto = await buildTransferDeedDto(facilityId, movementId, userId);
    return renderTransferDeedTemplate(dto);
  }

  /**
   * 6. Renders Sorting, Grading & Repacking Service Invoice HTML document.
   */
  public async renderSortingInvoiceDocument(
    facilityId: string,
    movementId: string,
    userId: string,
  ): Promise<string> {
    const dto = await buildSortingInvoiceDto(facilityId, movementId, userId);
    return renderSortingInvoiceTemplate(dto);
  }

  /**
   * 7. Renders Consignment Merge & Internal Shifting Invoice HTML document.
   */
  public async renderMergeInvoiceDocument(
    facilityId: string,
    movementId: string,
    userId: string,
  ): Promise<string> {
    const dto = await buildMergeShiftingInvoiceDto(facilityId, movementId, userId);
    return renderMergeShiftingInvoiceTemplate(dto);
  }
}

export const documentService = new DocumentService();
