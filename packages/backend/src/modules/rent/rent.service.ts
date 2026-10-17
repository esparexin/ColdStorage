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
import {
  readLedgerBalance,
  readLedgerBalanceMany,
  readLedgerNetDelivered,
  readLedgerNetDeliveredMany,
} from '../inventory/ledger-balance.js';
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
} from './handlers/record-payment.handler.js';
import { rentExtensionRepository } from './rent-extension.repository.js';
import { rentRepository } from './rent.repository.js';
import { buildRentSummary } from './rent-summary.helper.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { computeFirstSeasonHamali } from '../common/hamali-resolution.js';

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
    const [payments, netDelivered, balance, extensions, outwardInfo] = await Promise.all([
      rentRepository.findPaymentsByGrnId(facilityId, grn.id),
      readLedgerNetDelivered(facilityId, grn.id),
      readLedgerBalance(facilityId, grn.id),
      rentExtensionRepository.findExtensionsByGrn(facilityId, grn.id),
      rentRepository.getOutwardRentInfoForGrn(facilityId, grn.id),
    ]);
    const delivered = netDelivered?.total ?? 0;
    const remaining = balance?.total ?? Math.max(0, grn.bags - delivered);
    const commodity = await CommodityModel.findOne({ id: grn.commodityId }).lean().exec();
    const hamaliShare = computeFirstSeasonHamali(grn.bags, commodity, extensions, grn.hamaliRate, grn.hamaliAmount);
    return buildRentSummary(grn, payments, extensions, delivered, remaining, outwardInfo.total, hamaliShare, outwardInfo.earliestCreatedAt);
  }

  /**
   * Derives the rent summary for every GRN in a facility using batch queries.
   */
  public async getRentSummariesForFacility(facilityId: string, onlyGrnIds?: string[]): Promise<RentSummaryDto[]> {
    const grns = await GrnModel.find(
      onlyGrnIds && onlyGrnIds.length > 0 ? { facilityId, id: { $in: onlyGrnIds } } : { facilityId },
    )
      .sort({ date: -1, createdAt: -1 })
      .lean<GrnDoc[]>()
      .exec();
    const grnIds = grns.map((g) => g.id);
    if (grnIds.length === 0) return [];
    const scoped = onlyGrnIds !== undefined;

    const [paymentsByGrn, deliveredMap, balanceMap, extensionsByGrn, outwardRentMap] = await Promise.all([
      scoped
        ? rentRepository.findPaymentsByGrnIdsGrouped(facilityId, grnIds)
        : rentRepository.findPaymentsByFacilityGrouped(facilityId),
      readLedgerNetDeliveredMany(facilityId, grnIds),
      readLedgerBalanceMany(facilityId, grnIds),
      scoped
        ? rentExtensionRepository.findExtensionsByGrnIdsGrouped(facilityId, grnIds)
        : rentExtensionRepository.findExtensionsByFacilityGrouped(facilityId),
      scoped
        ? rentRepository.getOutwardRentInfoByGrnIdsGrouped(facilityId, grnIds)
        : rentRepository.getOutwardRentInfoByFacilityGrouped(facilityId),
    ]);
    const commodityIds = Array.from(new Set(grns.map((g) => g.commodityId)));
    const commodityDocs = await CommodityModel.find({ id: { $in: commodityIds } }).lean().exec();
    const commodityMap = new Map(commodityDocs.map((c) => [c.id, c]));

    return grns.map((grn) => {
      const delivered = deliveredMap.get(grn.id)?.total ?? 0;
      const remaining = balanceMap.get(grn.id)?.total ?? Math.max(0, grn.bags - delivered);
      const extensions = extensionsByGrn.get(grn.id) ?? [];
      const hamaliShare = computeFirstSeasonHamali(
        grn.bags, commodityMap.get(grn.commodityId) ?? null, extensions, grn.hamaliRate, grn.hamaliAmount,
      );
      const outwardInfo = outwardRentMap.get(grn.id);
      return buildRentSummary(
        grn,
        paymentsByGrn.get(grn.id) ?? [],
        extensions,
        delivered,
        remaining,
        outwardInfo?.total ?? 0,
        hamaliShare,
        outwardInfo?.earliestCreatedAt ?? null,
      );
    });
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

    const [netDelivered, organization, facility] = await Promise.all([
      readLedgerNetDelivered(facilityId, grn.id),
      getVerifiedOrganization(),
      getFacilitySubHeader(facilityId),
    ]);

    const netDeliveredBags = netDelivered.total;
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
      totalRentObligation: summary.totalDue,
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
