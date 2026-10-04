import mongoose from 'mongoose';
import {
  deriveBillingCycle,
  type RecordRentPaymentInput,
  type RecordRentPaymentResult,
  type RentReceiptDocumentDto,
  type RentSummaryDto,
  type StorageOccupancyFilter,
} from '@cold-storage/contracts';
import { GrnModel, type GrnDoc } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { computeRentBalance } from '../common/rent-balance.js';
import {
  calculateGrnMonthlyOccupancyRent,
  calculateGrnSeasonalOccupancyRent,
} from '../common/occupancy-rent.js';
import { generateStorageOccupancyReport } from '../common/storage-audit-report.js';
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
import type { RentPaymentDoc } from '../../database/models/rent-payment.model.js';

/**
 * Maps a GRN and its payments to the canonical rent summary DTO.
 *
 * Shared by the single-GRN lookup and the batched facility list so both derive
 * the balance through computeRentBalance and cannot drift apart.
 */
function buildRentSummary(grn: GrnDoc, payments: RentPaymentDoc[]): RentSummaryDto {
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
    return buildRentSummary(grn, payments);
  }

  /**
   * Derives the rent summary for every GRN in a facility using two queries.
   *
   * This replaces the client-side fan-out that fetched the GRN list and then
   * requested /rent/grn/:id once per GRN. That pattern cost one HTTP request and
   * four MongoDB round trips per row, so a facility with 100 GRNs spent roughly
   * 400 remote round trips and well over the per-minute rate limit on a single
   * page view.
   *
   * The balance is still derived through computeRentBalance, so this returns
   * byte-identical DTOs to getRentSummary and there is exactly one formula
   * governing rent state.
   */
  public async getRentSummariesForFacility(facilityId: string): Promise<RentSummaryDto[]> {
    const [grns, paymentsByGrn] = await Promise.all([
      GrnModel.find({ facilityId }).lean<GrnDoc[]>().exec(),
      rentRepository.findPaymentsByFacilityGrouped(facilityId),
    ]);

    return grns.map((grn) => buildRentSummary(grn, paymentsByGrn.get(grn.id) ?? []));
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

    const [deliveryAgg, organization, facility] = await Promise.all([
      InventoryTransactionModel.aggregate([
        {
          $match: {
            facilityId,
            grnId: grn.id,
            transactionType: { $in: ['OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'] },
          },
        },
        {
          $group: {
            _id: null,
            netDelivered: {
              $sum: {
                $cond: [{ $eq: ['$transactionType', 'OUTWARD_DELIVERY'] }, '$quantity', { $multiply: ['$quantity', -1] }],
              },
            },
          },
        },
      ]),
      getVerifiedOrganization(),
      getFacilitySubHeader(facilityId),
    ]);

    const netDeliveredBags = deliveryAgg[0]?.netDelivered ?? 0;
    const remainingBags = Math.max(0, grn.bags - netDeliveredBags);
    const billingCyclePeriod = deriveBillingCycle(grn.date, grn.rentType, payment.paymentDate);
    const previousPaidAmount = Math.max(0, summary.totalPaid - payment.amountPaid);

    const docDto: RentReceiptDocumentDto = {
      organization,
      facility,
      receiptNumber: payment.receiptNumber,
      grnNumber: grn.grnNumber,
      inwardReceiptNumber: grn.inwardReceiptNumber,
      inwardDate: grn.date,
      date: payment.paymentDate,
      customerName: grn.customerName,
      commodityName: grn.commodityName,
      chamber: grn.chamber,
      bagType: grn.bagType,
      inwardBags: grn.bags,
      deliveredBags: netDeliveredBags,
      remainingBags,
      bagPrice: grn.bagPrice ?? null,
      smallBagPrice: grn.smallBagPrice ?? null,
      bigBagPrice: grn.bigBagPrice ?? null,
      rentType: grn.rentType,
      rentMonths: grn.rentMonths ?? null,
      billingCyclePeriod,
      totalRentObligation: grn.rentAmount,
      previousPaidAmount,
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

  public async getMonthlyOccupancyRent(
    facilityId: string,
    grnId: string,
    options?: { asOfDate?: Date },
  ) {
    return calculateGrnMonthlyOccupancyRent(facilityId, grnId, options);
  }

  public async getSeasonalOccupancyRent(
    facilityId: string,
    grnId: string,
    options?: { seasonName?: string; seasonStart?: Date; seasonEnd?: Date },
  ) {
    return calculateGrnSeasonalOccupancyRent(facilityId, grnId, options);
  }

  public async getStorageOccupancyAuditReport(
    facilityId: string,
    filter?: StorageOccupancyFilter,
  ) {
    return generateStorageOccupancyReport(facilityId, filter);
  }
}

export const rentService = new RentService();
