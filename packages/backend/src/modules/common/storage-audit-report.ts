import {
  type StorageOccupancyFilter,
  type StorageOccupancyReport,
  type StorageOccupancyReportItem,
} from '@cold-storage/contracts';
import { GrnModel, type GrnDoc } from '../../database/models/grn.model.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';
import { computeRentBalance } from './rent-balance.js';
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
  const grnQuery: Record<string, unknown> = { facilityId };

  if (filter?.grnId) {
    grnQuery.id = filter.grnId;
  }
  if (filter?.inwardDate) {
    const start = new Date(filter.inwardDate);
    const end = new Date(filter.inwardDate);
    end.setUTCDate(end.getUTCDate() + 1);
    grnQuery.date = { $gte: start, $lt: end };
  }

  const grns = await GrnModel.find(grnQuery).sort({ date: 1, grnNumber: 1 }).lean<GrnDoc[]>().exec();

  const reportItems: StorageOccupancyReportItem[] = [];

  for (const grn of grns) {
    const [history, agg, monthlySummary, seasonalSummary] = await Promise.all([
      getGrnMovementHistory(facilityId, grn.id),
      RentPaymentModel.aggregate([
        { $match: { facilityId, grnId: grn.id } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
      calculateGrnMonthlyOccupancyRent(facilityId, grn.id),
      calculateGrnSeasonalOccupancyRent(facilityId, grn.id),
    ]);

    if (!history) continue;

    const totalPaid = agg[0]?.total ?? 0;
    const rentBalance = computeRentBalance(grn.rentAmount, totalPaid);

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
    if (filter?.outwardDate) {
      if (!item.outwardDate) return false;
      const dStr = item.outwardDate.toISOString().slice(0, 10);
      if (!dStr.startsWith(filter.outwardDate.slice(0, 10))) return false;
    }
    if (filter?.fromDate) {
      const cmpDate = item.outwardDate ?? item.inwardDate;
      if (cmpDate < new Date(filter.fromDate)) return false;
    }
    if (filter?.toDate) {
      const cmpDate = item.outwardDate ?? item.inwardDate;
      if (cmpDate > new Date(filter.toDate)) return false;
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
