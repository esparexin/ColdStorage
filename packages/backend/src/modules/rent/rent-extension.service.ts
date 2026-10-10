import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  calculatePeriodRent,
  deriveBagPrice,
  extensionSnapshotDate,
  resolveExtensionFinalAmount,
  seasonYearForInwardDate,
  type ExtensionPeriod,
  type FinalizeExtensionInput,
  type OverrideExtensionInput,
  type RentExtension,
} from '@cold-storage/contracts';
import { GrnModel } from '../../database/models/grn.model.js';
import { RentExtensionModel, type RentExtensionDoc } from '../../database/models/rent-extension.model.js';
import { auditService } from '../audit/audit.service.js';
import { readLedgerBalanceAsOf } from '../inventory/ledger-balance-asof.js';
import { commodityRateService } from '../commodities/commodity-rate.service.js';
import { toExtensionEntity, rentExtensionRepository } from './rent-extension.repository.js';

export class RentExtensionService {
  /**
   * Finalize one recurring billing period (SEASON renewal or JANUARY/FEBRUARY
   * monthly) under the same Seasonal GRN.
   *
   * Idempotent per (facility, GRN, season year, period): the unique index bills
   * each period exactly once. The charge uses the period-start snapshot, so
   * later dispatches never change it. The original Grn.rentAmount is untouched.
   */
  public async finalizeExtension(
    facilityId: string,
    input: FinalizeExtensionInput,
    userId: string,
  ): Promise<RentExtension> {
    const grn = await GrnModel.findOne({ id: input.grnId, facilityId }).lean().exec();
    if (!grn) {
      throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
    }
    if (grn.rentType !== 'Seasonal') {
      throw new Error(
        `Seasonal extensions apply only to Seasonal GRNs (GRN '${grn.grnNumber}' is '${grn.rentType}')`,
      );
    }
    // Same GRN spans successive seasons: later season years are valid, earlier ones are not.
    // The origin season's seasonal rent already lives on Grn.rentAmount, so a
    // SEASON period is only valid for a subsequent season (no double-billing).
    const originSeason = seasonYearForInwardDate(grn.date);
    if (input.seasonYear < originSeason) {
      throw new Error(
        `GRN '${grn.grnNumber}' belongs to season ${originSeason}, not ${input.seasonYear}`,
      );
    }
    if (input.period === 'SEASON' && input.seasonYear === originSeason) {
      throw new Error(
        `Season ${originSeason} for GRN '${grn.grnNumber}' is already covered by its original seasonal rent`,
      );
    }

    const snapshotDate = extensionSnapshotDate(input.seasonYear, input.period);
    if (snapshotDate.getTime() > Date.now()) {
      throw new Error(
        `Cannot finalize ${input.period} for season ${input.seasonYear} before it begins`,
      );
    }

    const session = await mongoose.startSession();
    try {
      let created: RentExtensionDoc | null = null;
      await session.withTransaction(async () => {
        const existing = await RentExtensionModel.findOne(
          { facilityId, grnId: grn.id, seasonYear: input.seasonYear, period: input.period },
          null,
          { session },
        )
          .lean<RentExtensionDoc>()
          .exec();
        if (existing) {
          created = existing;
          return;
        }

        const snapshot = await readLedgerBalanceAsOf(facilityId, grn.id, snapshotDate, session);
        if (snapshot.total <= 0) {
          throw new Error(
            `No bags remained on ${input.period} snapshot for GRN '${grn.grnNumber}': no extension due`,
          );
        }

        // Period pair: controller rate for the period kind, else the legacy
        // single rate on both sides. S+B snapshots keep their split via SSOT.
        const legacySingle =
          grn.bagPrice ??
          deriveBagPrice({
            rentType: grn.rentType,
            bags: grn.bags,
            bagPrice: grn.bagPrice,
            rentMonths: grn.rentMonths,
            rentAmount: grn.rentAmount,
          }) ??
          null;
        const pair = await commodityRateService.resolvePeriodPair(
          grn.commodityId,
          input.period,
          legacySingle,
        );
        if (!pair) {
          throw new Error(
            `Cannot price the ${input.period} extension for GRN '${grn.grnNumber}': no bag rate`,
          );
        }

        const calculatedAmount = calculatePeriodRent({
          period: input.period,
          bagType: grn.bagType,
          snapshotSmallBags: snapshot.smallBags,
          snapshotBigBags: snapshot.bigBags,
          smallRate: pair.smallRate,
          bigRate: pair.bigRate,
        });
        // Effective per-bag rate actually charged (weighted average for splits).
        const bagRate = Number((calculatedAmount / snapshot.total).toFixed(2));
        const now = new Date();
        const docs = await RentExtensionModel.create(
          [
            {
              id: `re-${randomUUID()}`,
              facilityId,
              grnId: grn.id,
              grnNumber: grn.grnNumber,
              seasonYear: input.seasonYear,
              period: input.period as ExtensionPeriod,
              snapshotDate,
              snapshotBags: snapshot.total,
              bagRate,
              calculatedAmount,
              manualAmount: null,
              finalAmount: calculatedAmount,
              overrideReason: null,
              overriddenBy: null,
              overriddenAt: null,
              finalizedBy: userId,
              finalizedAt: now,
            },
          ],
          { session },
        );
        created = docs[0];
      });

      const entity = toExtensionEntity(created!);
      await auditService.log({
        eventType: 'RENT_EXTENSION_FINALIZED',
        severity: 'INFO',
        userId,
        facilityId,
        resource: 'rent-extension',
        resourceId: entity.id,
        details: {
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          seasonYear: entity.seasonYear,
          period: entity.period,
          snapshotBags: entity.snapshotBags,
          bagRate: entity.bagRate,
          finalAmount: entity.finalAmount,
        },
      });
      return entity;
    } catch (err: unknown) {
      // Lost a creation race: the month already exists, so return it instead
      // of billing twice. The unique index is the backstop, this is the read.
      if (err instanceof Error && err.message.includes('duplicate key')) {
        const existing = await RentExtensionModel.findOne({
          facilityId,
          grnId: grn.id,
          seasonYear: input.seasonYear,
          period: input.period,
        }).lean<RentExtensionDoc>();
        if (existing) return toExtensionEntity(existing);
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Authorized manual override of a finalized extension. Records calculated,
   * manual and final amounts plus reason/actor/timestamp; the original
   * Seasonal rent and the snapshot are never altered.
   */
  public async overrideExtension(
    facilityId: string,
    extensionId: string,
    input: OverrideExtensionInput,
    userId: string,
  ): Promise<RentExtension> {
    const existing = await RentExtensionModel.findOne({ id: extensionId, facilityId }).exec();
    if (!existing) {
      throw new Error(`Rent extension '${extensionId}' not found in facility '${facilityId}'`);
    }

    const finalAmount = resolveExtensionFinalAmount(existing.calculatedAmount, input.manualAmount);
    const now = new Date();
    existing.manualAmount = input.manualAmount;
    existing.finalAmount = finalAmount;
    existing.overrideReason = input.reason.trim();
    existing.overriddenBy = userId;
    existing.overriddenAt = now;
    await existing.save();

    await auditService.log({
      eventType: 'RENT_EXTENSION_OVERRIDDEN',
      severity: 'INFO',
      userId,
      facilityId,
      resource: 'rent-extension',
      resourceId: existing.id,
      details: {
        grnId: existing.grnId,
        grnNumber: existing.grnNumber,
        seasonYear: existing.seasonYear,
        period: existing.period,
        calculatedAmount: existing.calculatedAmount,
        manualAmount: input.manualAmount,
        finalAmount,
        reason: input.reason.trim(),
      },
    });

    return toExtensionEntity(existing);
  }
  public async getExtensionsForGrn(facilityId: string, grnId: string): Promise<RentExtension[]> {
    return rentExtensionRepository.findExtensionsByGrn(facilityId, grnId);
  }
}

export const rentExtensionService = new RentExtensionService();
