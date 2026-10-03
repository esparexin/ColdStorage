import mongoose from 'mongoose';
import type {
  RecordRentPaymentInput,
  RecordRentPaymentResult,
  RentReceiptDocumentDto,
  RentSummaryDto,
} from '@cold-storage/contracts';
import { GrnModel, type GrnDoc } from '../../database/models/grn.model.js';
import { computeRentBalance } from '../common/rent-balance.js';
import { renderRentReceiptTemplate } from '../documents/templates/rent-receipt.template.js';
import {
  getFacilitySubHeader,
  getVerifiedOrganization,
} from '../documents/document-headers.helper.js';
import {
  executeRecordPayment,
  toPaymentEntity,
} from './handlers/record-payment.handler.js';
import { rentRepository } from './rent.repository.js';

export class RentService {
  /**
   * Single canonical GRN resolver supporting either internal ID or operator-facing grnNumber
   * under strict facility scoping.
   */
  public async resolveGrn(
    facilityId: string,
    identifier: string,
    session?: mongoose.ClientSession,
  ): Promise<GrnDoc> {
    const grn = await GrnModel.findOne(
      {
        facilityId,
        $or: [{ id: identifier }, { grnNumber: identifier }],
      },
      null,
      { session },
    )
      .lean<GrnDoc>()
      .exec();

    if (!grn) {
      throw new Error(`GRN '${identifier}' not found in facility '${facilityId}'`);
    }

    return grn;
  }

  /**
   * Derives current rent summary, remaining balance, and payment history for a GRN.
   */
  public async getRentSummary(facilityId: string, identifier: string): Promise<RentSummaryDto> {
    const grn = await this.resolveGrn(facilityId, identifier);
    const payments = await rentRepository.findPaymentsByGrnId(facilityId, grn.id);
    const balance = computeRentBalance(
      grn.rentAmount,
      payments.reduce((sum, p) => sum + p.amountPaid, 0),
    );

    return {
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      facilityId: grn.facilityId,
      customerId: grn.customerId,
      customerName: grn.customerName,
      commodityName: grn.commodityName,
      chamber: grn.chamber,
      inwardDate: grn.date,
      totalBags: grn.bags,
      rentType: grn.rentType,
      rentAmount: balance.rentAmount,
      rentMonths: grn.rentMonths ?? null,
      totalPaid: balance.totalPaid,
      remainingBalance: balance.remainingBalance,
      paymentStatus: balance.paymentStatus,
      payments: payments.map((p) => toPaymentEntity(p)),
    };
  }

  /**
   * Atomically records a rent payment transaction against a GRN using the established P5/P6
   * transactional write-lock pattern to strictly prevent concurrent over-collection.
   */
  public async recordPayment(
    facilityId: string,
    input: RecordRentPaymentInput,
    userId: string,
  ): Promise<RecordRentPaymentResult> {
    return executeRecordPayment(
      facilityId,
      input,
      userId,
      (fId, gId) => this.getRentSummary(fId, gId),
    );
  }

  /**
   * Renders the authoritative printable HTML receipt for a confirmed rent payment.
   */
  public async renderReceipt(
    facilityId: string,
    receiptNumber: string,
    _userId: string,
  ): Promise<string> {
    const payment = await rentRepository.findByReceiptNumber(facilityId, receiptNumber);
    if (!payment) {
      throw new Error(`Receipt '${receiptNumber}' not found in facility '${facilityId}'`);
    }

    const grn = await GrnModel.findOne({ id: payment.grnId, facilityId }).lean<GrnDoc>().exec();
    if (!grn) {
      throw new Error(`GRN '${payment.grnId}' not found for receipt '${receiptNumber}'`);
    }

    const summary = await this.getRentSummary(facilityId, grn.id);

    // Bind to the canonical document header helpers so the rent receipt renders with the
    // same System Settings organization header and facility sub-header as every other
    // official document, and is subject to the same ORGANIZATION_NOT_CONFIGURED guard.
    const organization = await getVerifiedOrganization();
    const facility = await getFacilitySubHeader(facilityId);

    const docDto: RentReceiptDocumentDto = {
      organization,
      facility,
      receiptNumber: payment.receiptNumber,
      grnNumber: grn.grnNumber,
      date: payment.paymentDate,
      customerName: grn.customerName,
      commodityName: grn.commodityName,
      chamber: grn.chamber,
      totalRentObligation: grn.rentAmount,
      amountPaid: payment.amountPaid,
      paymentMode: payment.paymentMode,
      remainingBalance: summary.remainingBalance,
      paymentStatus: summary.paymentStatus,
      isPreview: false,
      notes: payment.notes,
      generatedAt: new Date(),
      generatedBy: payment.createdBy,
    };

    return renderRentReceiptTemplate(docDto);
  }
}

export const rentService = new RentService();
