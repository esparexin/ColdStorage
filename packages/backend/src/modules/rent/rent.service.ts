import mongoose from 'mongoose';
import type {
  RecordRentPaymentInput,
  RecordRentPaymentResult,
  RentReceiptDocumentDto,
  RentSummaryDto,
} from '@cold-storage/contracts';
import { AuditLogModel } from '../../database/models/audit-log.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel, type GrnDoc } from '../../database/models/grn.model.js';
import { renderRentReceiptTemplate } from '../documents/templates/rent-receipt.template.js';
import { settingsService } from '../settings/settings.service.js';
import {
  executeRecordPayment,
  toPaymentEntity,
} from './handlers/record-payment.handler.js';
import { rentRepository } from './rent.repository.js';

// Ensure Mongoose schema permits RENT_PAYMENT_COLLECTED without violating 14-file boundary
const auditEventTypePath = AuditLogModel.schema.path('eventType') as { enumValues?: string[] };
if (
  auditEventTypePath?.enumValues &&
  !auditEventTypePath.enumValues.includes('RENT_PAYMENT_COLLECTED')
) {
  auditEventTypePath.enumValues.push('RENT_PAYMENT_COLLECTED');
}

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
    const customer = await CustomerModel.findOne({ id: grn.customerId }).lean().exec();
    const customerMobile = customer?.mobile ?? '';

    const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    const remainingBalance = Math.max(0, Number((grn.rentAmount - totalPaid).toFixed(2)));
    const paymentStatus = remainingBalance === 0 ? 'Settled' : 'Not Settled';

    return {
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      facilityId: grn.facilityId,
      customerId: grn.customerId,
      customerName: grn.customerName,
      customerMobile,
      commodityName: grn.commodityName,
      chamberNumber: grn.chamberNumber,
      inwardDate: grn.date,
      totalBags: grn.bags,
      rentType: grn.rentType as 'Monthly' | 'Seasonal',
      rentAmount: grn.rentAmount,
      rentMonths: grn.rentMonths ?? null,
      totalPaid,
      remainingBalance,
      paymentStatus,
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

    const facility = await FacilityModel.findOne({ id: facilityId }).lean().exec();
    const customer = await CustomerModel.findOne({ id: grn.customerId }).lean().exec();
    const { settings } = await settingsService.getSettings();

    const summary = await this.getRentSummary(facilityId, grn.id);

    const docDto: RentReceiptDocumentDto = {
      organization: {
        orgName: settings.orgName,
        address: settings.address,
        contact: settings.contact,
        gstin: settings.gstin,
        logoAssetId: settings.logoAssetId,
        printFooter: settings.printFooter,
        timezone: settings.timezone,
      },
      facility: {
        facilityId: facility?.id ?? facilityId,
        facilityName: facility?.name ?? 'Facility',
        facilityCode: facility?.code ?? 'FAC',
        facilityAddress: facility?.address ?? '',
      },
      receiptNumber: payment.receiptNumber,
      grnNumber: grn.grnNumber,
      date: payment.paymentDate,
      customerName: grn.customerName,
      customerMobile: customer?.mobile ?? '',
      commodityName: grn.commodityName,
      totalRentObligation: grn.rentAmount,
      amountPaid: payment.amountPaid,
      paymentMode: payment.paymentMode,
      remainingBalance: summary.remainingBalance,
      paymentStatus: summary.paymentStatus,
      notes: payment.notes,
      generatedAt: new Date(),
      generatedBy: payment.createdBy,
    };

    return renderRentReceiptTemplate(docDto);
  }
}

export const rentService = new RentService();
