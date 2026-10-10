import type mongoose from 'mongoose';
import { totalRentDue, type RentExtension } from '@cold-storage/contracts';
import { RentExtensionModel, type RentExtensionDoc } from '../../database/models/rent-extension.model.js';

export function toExtensionEntity(doc: RentExtensionDoc): RentExtension {
  return {
    id: doc.id,
    facilityId: doc.facilityId,
    grnId: doc.grnId,
    grnNumber: doc.grnNumber,
    seasonYear: doc.seasonYear,
    period: doc.period,
    snapshotDate: doc.snapshotDate,
    snapshotBags: doc.snapshotBags,
    bagRate: doc.bagRate,
    calculatedAmount: doc.calculatedAmount,
    manualAmount: doc.manualAmount,
    finalAmount: doc.finalAmount,
    overrideReason: doc.overrideReason,
    overriddenBy: doc.overriddenBy,
    overriddenAt: doc.overriddenAt,
    finalizedBy: doc.finalizedBy,
    finalizedAt: doc.finalizedAt,
    createdAt: doc.createdAt,
  };
}

export class RentExtensionRepository {
  public async findExtensionsByGrn(
    facilityId: string,
    grnId: string,
    session?: mongoose.ClientSession,
  ): Promise<RentExtension[]> {
    const docs = await RentExtensionModel.find({ facilityId, grnId }, null, { session })
      .sort({ seasonYear: 1, period: 1 })
      .lean<RentExtensionDoc[]>()
      .exec();
    return docs.map(toExtensionEntity);
  }

  /** Every finalized extension for a facility in one round trip, grouped by GRN. */
  public async findExtensionsByFacilityGrouped(
    facilityId: string,
  ): Promise<Map<string, RentExtension[]>> {
    const docs = await RentExtensionModel.find({ facilityId })
      .sort({ seasonYear: 1, period: 1 })
      .lean<RentExtensionDoc[]>()
      .exec();
    const grouped = new Map<string, RentExtension[]>();
    for (const doc of docs) {
      const entity = toExtensionEntity(doc);
      const existing = grouped.get(entity.grnId);
      if (existing) {
        existing.push(entity);
      } else {
        grouped.set(entity.grnId, [entity]);
      }
    }
    return grouped;
  }

  /** Sum of finalized extension amounts per GRN, in one round trip. */
  public async getExtensionTotalsForGrns(
    facilityId: string,
    grnIds: string[],
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (grnIds.length === 0) return totals;
    const rows = await RentExtensionModel.aggregate<{ _id: string; total: number }>([
      { $match: { facilityId, grnId: { $in: grnIds } } },
      { $group: { _id: '$grnId', total: { $sum: '$finalAmount' } } },
    ]);
    for (const row of rows) totals.set(row._id, Number(row.total ?? 0));
    return totals;
  }

  /**
   * Total rent due: original Seasonal obligation plus finalized extensions.
   * With no extensions this equals Grn.rentAmount exactly (migration-safe).
   * Delegates the arithmetic to the canonical `totalRentDue` SSOT.
   */
  public async resolveTotalDue(
    facilityId: string,
    grn: { id: string; rentAmount: number },
    session?: mongoose.ClientSession,
  ): Promise<number> {
    const agg = await RentExtensionModel.aggregate<{ _id: null; total: number }>([
      { $match: { facilityId, grnId: grn.id } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]).session(session ?? null);
    return totalRentDue(Number(grn.rentAmount ?? 0), [Number(agg[0]?.total ?? 0)]);
  }
}

export const rentExtensionRepository = new RentExtensionRepository();
