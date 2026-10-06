import type { FilterQuery } from 'mongoose';
import {
  totalRentDue,
  type StorageOccupancyFilter,
  type StorageOccupancyReport,
  type StorageOccupancyReportItem,
} from '@cold-storage/contracts';
import { GrnModel, type GrnDoc } from '../../database/models/grn.model.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';
import { computeRentBalance } from './rent-balance.js';
import { rentExtensionRepository } from '../rent/rent-extension.repository.js';
import { getGrnMovementHistory } from './grn-movement-history.js';
import {
  calculateGrnMonthlyOccupancyRent,
  calculateGrnSeasonalOccupancyRent,
} from './occupancy-rent.js';

export async function generateStorageOccupancyReport(
  facilityId: string,
  filter?: StorageOccupancyFilter,
): Promise<StorageOccupancyReport> {
  const view = filter?.view ?? 'movement';
  const grnQuery: FilterQuery<GrnDoc> = {
    facilityId: { $eq: String(facilityId) },
  };

  if (typeof filter?.grnId === 'string' && filter.grnId.trim()) {
    grnQuery.id = { $eq: filter.grnId.trim() };
  }
  if (typeof filter?.inwardDate === 'string' && filter.inwardDate.trim()) {
    const start = new Date(filter.inwardDate);
    if (!isNaN(start.getTime())) {
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      grnQuery.date = { $gte: start, $lt: end };
    }
  }

  const grns = await GrnModel.find(grnQuery).sort({ date: 1, grnNumber: 1 }).lean<GrnDoc[]>().exec();

  // One grouped aggregate for every GRN in the report instead of one per GRN.
  // The report is scoped by facility and by the matched GRN ids, so a single
  // $match/$group returns exactly the totals the loop was computing one at a time.
  const totalPaidByGrn = new Map<string, number>();
  if (grns.length > 0) {
    const paidAgg = await RentPaymentModel.aggregate([
      { $match: { facilityId, grnId: { $in: grns.map((g) => g.id) } } },
      { $group: { _id: '$grnId', total: { $sum: '$amountPaid' } } },
    ]);
    for (const row of paidAgg) {
      totalPaidByGrn.set(row._id as string, row.total as number);
    }
  }
  const extensionTotalsByGrn = await rentExtensionRepository.getExtensionTotalsForGrns(
    facilityId,
    grns.map((g) => g.id),
  );

  const reportItems: StorageOccupancyReportItem[] = [];

  for (const grn of grns) {
    const [history, monthlySummary, seasonalSummary] = await Promise.all([
      getGrnMovementHistory(facilityId, grn.id),
      calculateGrnMonthlyOccupancyRent(facilityId, grn.id),
      calculateGrnSeasonalOccupancyRent(facilityId, grn.id),
    ]);

    if (!history) continue;

    const totalPaid = totalPaidByGrn.get(grn.id) ?? 0;
    // extensionTotalsByGrn holds the pre-aggregated sum of all finalAmounts for this GRN.
    // totalRentDue() accepts individual extension amounts and sums them internally; wrapping
    // the pre-summed value in a single-element array routes through the SSOT formula
    // (identical result, consistent rounding behaviour with all other call sites).
    const totalDue = totalRentDue(
      grn.rentAmount,
      extensionTotalsByGrn.get(grn.id) ? [extensionTotalsByGrn.get(grn.id)!] : [],
    );
    const rentBalance = computeRentBalance(totalDue, totalPaid);

    if (view === 'monthly' && monthlySummary) {
      for (const p of monthlySummary.periods) {
        reportItems.push({
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          customerId: grn.customerId,
          customerName: grn.customerName,
          commodityName: grn.commodityName,
          chamber: grn.chamber,
          inwardDate: grn.date,
          outwardDate: p.outwardDate ?? null,
          movementType: 'MONTHLY_OCCUPANCY',
          openingBags: p.openingBags,
          deliveredBags: p.deliveredBags,
          closingBags: p.remainingBags,
          marks: grn.marks ?? null,
          gpNumber: grn.gpNumber ?? null,
          sbNumber: null,
          remarks: `Month: ${p.applicableMonth}`,
          month: p.applicableMonth,
          season: null,
          applicableOccupancy: p.occupancyBags,
          calculatedRent: p.calculatedCharge,
          paymentStatus: rentBalance.paymentStatus,
          totalPaid: rentBalance.totalPaid,
          remainingBalance: rentBalance.remainingBalance,
        });
      }
    } else if (view === 'seasonal' && seasonalSummary) {
      reportItems.push({
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        customerId: grn.customerId,
        customerName: grn.customerName,
        commodityName: grn.commodityName,
        chamber: grn.chamber,
        inwardDate: grn.date,
        outwardDate: seasonalSummary.finalOutwardDate ?? null,
        movementType: 'SEASONAL_OCCUPANCY',
        openingBags: grn.bags,
        deliveredBags: seasonalSummary.netDeliveredBags,
        closingBags: seasonalSummary.remainingBags,
        marks: grn.marks ?? null,
        gpNumber: grn.gpNumber ?? null,
        sbNumber: null,
        remarks: seasonalSummary.seasonName,
        month: null,
        season: seasonalSummary.seasonName,
        applicableOccupancy: seasonalSummary.bagOccupancy,
        calculatedRent: seasonalSummary.calculatedCharge,
        paymentStatus: rentBalance.paymentStatus,
        totalPaid: rentBalance.totalPaid,
        remainingBalance: rentBalance.remainingBalance,
      });
    } else {
      for (const entry of history.entries) {
        const isOutward = entry.type !== 'INWARD';
        reportItems.push({
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          customerId: grn.customerId,
          customerName: grn.customerName,
          commodityName: grn.commodityName,
          chamber: grn.chamber,
          inwardDate: grn.date,
          outwardDate: isOutward ? entry.date : null,
          movementType: entry.type,
          openingBags: entry.openingBags,
          deliveredBags: entry.deliveredBags,
          closingBags: entry.closingBags,
          marks: entry.marks ?? grn.marks ?? null,
          gpNumber: entry.gpNumber ?? grn.gpNumber ?? null,
          sbNumber: null,
          remarks: entry.remarks ?? null,
          month: entry.date.toISOString().slice(0, 7),
          season: seasonalSummary?.seasonName ?? null,
          applicableOccupancy: entry.closingBags,
          calculatedRent:
            grn.rentType === 'Seasonal'
              ? (seasonalSummary?.calculatedCharge ?? 0)
              : (monthlySummary?.totalOccupancyCharge ?? 0),
          paymentStatus: rentBalance.paymentStatus,
          totalPaid: rentBalance.totalPaid,
          remainingBalance: rentBalance.remainingBalance,
        });
      }
    }
  }

  const filteredItems = reportItems.filter((item) => {
    if (filter?.closingBalance !== undefined && item.closingBags !== filter.closingBalance) {
      return false;
    }
    if (typeof filter?.outwardDate === 'string' && filter.outwardDate.trim()) {
      if (!item.outwardDate) return false;
      const dStr = item.outwardDate.toISOString().slice(0, 10);
      const targetStr = filter.outwardDate.trim().slice(0, 10);
      if (!dStr.startsWith(targetStr)) return false;
    }
    if (typeof filter?.fromDate === 'string' && filter.fromDate.trim()) {
      const from = new Date(filter.fromDate);
      if (!isNaN(from.getTime())) {
        const cmpDate = item.outwardDate ?? item.inwardDate;
        if (cmpDate < from) return false;
      }
    }
    if (typeof filter?.toDate === 'string' && filter.toDate.trim()) {
      const to = new Date(filter.toDate);
      if (!isNaN(to.getTime())) {
        const cmpDate = item.outwardDate ?? item.inwardDate;
        if (cmpDate > to) return false;
      }
    }
    return true;
  });

  return {
    facilityId,
    generatedAt: new Date(),
    view,
    totalRecords: filteredItems.length,
    items: filteredItems,
  };
}
