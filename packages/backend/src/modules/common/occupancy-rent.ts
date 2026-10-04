import {
  calculateMonthlyOccupancy,
  deriveBagPrice,
  type GrnOccupancyRentSummary,
  type MovementSnapshot,
} from '@cold-storage/contracts';
import { GrnModel } from '../../database/models/grn.model.js';
import { getGrnMovementHistory } from './grn-movement-history.js';

/**
 * Canonical service for calculating monthly occupancy-based rent.
 *
 * Consumes:
 * 1. GrnModel for core inward terms and bag rates.
 * 2. Canonical getGrnMovementHistory() for chronological ledger balance movements.
 * 3. Contract pure calculateMonthlyOccupancy() calculation.
 */
export async function calculateGrnMonthlyOccupancyRent(
  facilityId: string,
  grnId: string,
  options?: { asOfDate?: Date },
): Promise<GrnOccupancyRentSummary | null> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) return null;

  const history = await getGrnMovementHistory(facilityId, grnId);
  if (!history) return null;

  const effectiveBagRate =
    grn.bagPrice ??
    deriveBagPrice({
      rentType: grn.rentType,
      bags: grn.bags,
      bagPrice: grn.bagPrice,
      rentMonths: grn.rentMonths,
      rentAmount: grn.rentAmount,
    }) ??
    0;

  const movementSnapshots: MovementSnapshot[] = history.entries
    .filter((e) => e.type !== 'INWARD')
    .map((e) => ({
      date: e.date,
      type: e.type,
      deliveredBags: e.deliveredBags,
      closingBags: e.closingBags,
    }));

  const periods = calculateMonthlyOccupancy({
    grnId: grn.id,
    grnNumber: grn.grnNumber,
    inwardDate: grn.date,
    totalBags: grn.bags,
    bagRate: effectiveBagRate,
    movements: movementSnapshots,
    asOfDate: options?.asOfDate,
  });

  const totalOccupancyCharge = Number(
    periods.reduce((sum, p) => sum + p.calculatedCharge, 0).toFixed(2),
  );

  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    rentType: grn.rentType,
    totalInwardBags: grn.bags,
    currentRemainingBags: history.currentClosingBags,
    bagRate: effectiveBagRate,
    totalOccupancyCharge,
    periods,
  };
}
