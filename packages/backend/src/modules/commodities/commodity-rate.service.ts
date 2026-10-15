import { randomUUID } from 'node:crypto';
import {
  calculateRentAmount,
  resolveControllerRentType,
  type BagType,
  type CommodityRate,
  type RentType,
  type UpsertCommodityRateInput,
} from '@cold-storage/contracts';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CommodityRateModel, type CommodityRateDoc } from '../../database/models/commodity-rate.model.js';

export interface SubmittedRateAgreement {
  bagType?: BagType | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  bagPrice?: number | null;
  rentAmount?: number | null;
  bags?: number | null;
  smallBags?: number | null;
  bigBags?: number | null;
  rentMonths?: number | null;
}

export interface RateValidationOptions {
  /**
   * Fail closed when true: a configured pair requires submitted rates (B4).
   * False preserves the legacy path (unconfigured commodities, CSV imports
   * pending an approved compatibility policy). Always explicit per caller.
   */
  requireRates: boolean;
}

const rateMismatch = (commodityId: string, rentType: RentType, detail: string): Error =>
  new Error(
    `Submitted rates do not match the active ${rentType} controller rate for commodity '${commodityId}': ${detail}`,
  );

export class CommodityRateService {
  /**
   * Creates or replaces the authoritative rate row for one
   * (commodity, rent type) pair. Seasonal and monthly rows are independent:
   * updating one never touches the other. Never reprices history — stored
   * GRN obligations and payments are untouched; only future validations and
   * finalizations read the new row.
   */
  public async upsertRate(input: UpsertCommodityRateInput): Promise<CommodityRate> {
    const commodity = await CommodityModel.findOne({ id: input.commodityId }).lean().exec();
    if (!commodity) {
      throw new Error(`Commodity '${input.commodityId}' not found`);
    }

    // Rent-vs-Hamali policy: when Hamali handling is enabled with a positive
    // rate, per-bag rent rates must exceed it. Historical GRN obligations and
    // payments are never repriced by this check.
    const hamaliRate = commodity.isHamaliApplicable ? (commodity.hamaliRate ?? 0) : 0;
    if (hamaliRate > 0 && (input.smallRate <= hamaliRate || input.bigRate <= hamaliRate)) {
      throw new Error(
        `Submitted ${input.rentType} rates (Small ₹${input.smallRate}, Big ₹${input.bigRate}) must exceed the Hamali rate of ₹${hamaliRate}/bag for commodity '${commodity.name}'`,
      );
    }

    const update: Partial<CommodityRateDoc> = {
      smallRate: input.smallRate,
      bigRate: input.bigRate,
      isActive: input.isActive ?? true,
    };
    if (input.hamaliRate !== undefined && input.hamaliRate !== null) {
      update.hamaliRate = input.hamaliRate;
    }

    const doc = await CommodityRateModel.findOneAndUpdate(
      { commodityId: input.commodityId, rentType: input.rentType },
      {
        $set: update,
        $setOnInsert: { id: `crt-${randomUUID()}`, commodityId: input.commodityId, rentType: input.rentType },
      },
      { new: true, upsert: true },
    )
      .lean<CommodityRateDoc>()
      .exec();

    return this.toEntity(doc!);
  }

  /** Active authoritative row for one (commodity, rent type) pair, if any. */
  public async getRate(commodityId: string, rentType: RentType): Promise<CommodityRate | null> {
    const controllerType = resolveControllerRentType(rentType);
    const doc = await CommodityRateModel.findOne({ commodityId, rentType: controllerType, isActive: true })
      .lean<CommodityRateDoc>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  /** All rate rows (active and inactive) for one commodity. */
  public async listRates(commodityId: string): Promise<CommodityRate[]> {
    const docs = await CommodityRateModel.find({ commodityId })
      .sort({ rentType: 1 })
      .lean<CommodityRateDoc[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  /**
   * Period pair for finalization: the active controller row for the period
   * kind (SEASON → Seasonal, JANUARY/FEBRUARY → Monthly), else the legacy
   * single rate mapped to both sides when it is positive, else null.
   * Legacy fallback keeps unconfigured commodities billing exactly as before.
   */
  public async resolvePeriodPair(
    commodityId: string,
    period: 'SEASON' | 'JANUARY' | 'FEBRUARY',
    legacySingleRate: number | null,
  ): Promise<{ smallRate: number; bigRate: number } | null> {
    const rate = await this.getRate(commodityId, period === 'SEASON' ? 'Seasonal' : 'Monthly');
    if (rate) return { smallRate: rate.smallRate, bigRate: rate.bigRate };
    if (typeof legacySingleRate === 'number' && legacySingleRate > 0) {
      return { smallRate: legacySingleRate, bigRate: legacySingleRate };
    }
    return null;
  }

  /**
   * Enforces controller authority on newly submitted agreed rates.
   * When an active row exists for (commodity, rent type):
   * - each submitted side must equal it exactly (2dp); single `bagPrice` is
   *   mapped by bag type (S/S-B→small, B→big); S+B requires the split pair;
   * - a positive `rentAmount` must equal the SSOT-derived obligation, so lump
   *   sums cannot contradict the agreed rates (dynamic `0` always passes);
   * - with `requireRates`, omitted rates are rejected instead of vacuously passing.
   * When no active row exists the legacy path is preserved untouched.
   */
  public async validateSubmittedRates(
    commodityId: string,
    rentType: RentType,
    submitted: SubmittedRateAgreement,
    opts: RateValidationOptions,
  ): Promise<void> {
    const rate = await this.getRate(commodityId, rentType);
    if (!rate) return;
    const norm = (n: number) => Number(n.toFixed(2));
    const useSplit = submitted.bagType === 'S+B' || submitted.bagType === 'S/B';
    const singleSide = submitted.bagType === 'B' ? rate.bigRate : rate.smallRate;
    const hasAnyRate =
      submitted.smallBagPrice != null || submitted.bigBagPrice != null || submitted.bagPrice != null;
    if (opts.requireRates && !hasAnyRate) {
      throw rateMismatch(
        commodityId, rentType,
        `no bag rates submitted (Small ₹${rate.smallRate}, Big ₹${rate.bigRate} required)`,
      );
    }
    if (!hasAnyRate) return;
    if (useSplit && (submitted.smallBagPrice == null || submitted.bigBagPrice == null)) {
      throw rateMismatch(commodityId, rentType, `${submitted.bagType} requires both Small and Big bag rates`);
    }
    // Inward is total-only: composition confirmation is deferred to outward.
    // Unverified differential lots keep pending (0) rent via SSOT, never a guess.
    const mismatch =
      (submitted.smallBagPrice != null && norm(submitted.smallBagPrice) !== norm(rate.smallRate)) ||
      (submitted.bigBagPrice != null && norm(submitted.bigBagPrice) !== norm(rate.bigRate)) ||
      (submitted.bagPrice != null && !useSplit && norm(submitted.bagPrice) !== norm(singleSide));
    if (mismatch) {
      throw rateMismatch(
        commodityId, rentType, `Small ₹${rate.smallRate}, Big ₹${rate.bigRate} required`,
      );
    }
    // Lump-sum invariant: a positive rentAmount must equal the SSOT derivation
    // from the (now verified) agreed rates. Skipped when underivable.
    if (
      submitted.rentAmount != null && submitted.rentAmount > 0 &&
      submitted.bags != null && submitted.bags > 0 &&
      (!useSplit || (submitted.smallBags != null && submitted.bigBags != null))
    ) {
      const expected = calculateRentAmount({
        rentType,
        bags: submitted.bags,
        bagType: submitted.bagType ?? undefined,
        smallBags: submitted.smallBags,
        bigBags: submitted.bigBags,
        smallBagPrice: useSplit ? rate.smallRate : undefined,
        bigBagPrice: useSplit ? rate.bigRate : undefined,
        bagPrice: useSplit ? undefined : singleSide,
        rentMonths: submitted.rentMonths,
      });
      if (Math.abs(norm(submitted.rentAmount) - expected) > 0.01) {
        throw rateMismatch(
          commodityId, rentType,
          `rent amount ₹${submitted.rentAmount} contradicts the derived ₹${expected}`,
        );
      }
    }
  }

  public toEntity(doc: CommodityRateDoc | CommodityRate): CommodityRate {
    return {
      id: doc.id,
      commodityId: doc.commodityId,
      rentType: doc.rentType,
      smallRate: doc.smallRate,
      bigRate: doc.bigRate,
      hamaliRate: doc.hamaliRate ?? 0,
      isActive: doc.isActive,
    };
  }

  /**
   * Atomic batch upsert (F2): validate all rows (incl. hamali guard) before
   * any write; on partial failure restore snapshots (rollback). No txn
   * dependency: safe on standalone MongoDB; uses same per-row upsert path.
   */
  public async upsertRateBatch(commodityId: string, rows: UpsertCommodityRateInput[]): Promise<CommodityRate[]> {
    const commodity = await CommodityModel.findOne({ id: commodityId }).lean().exec();
    if (!commodity) throw new Error(`Commodity '${commodityId}' not found`);
    const hamaliRate = commodity.isHamaliApplicable ? (commodity.hamaliRate ?? 0) : 0;
    for (const r of rows) {
      if (hamaliRate > 0 && (r.smallRate <= hamaliRate || r.bigRate <= hamaliRate)) {
        throw new Error(`Submitted ${r.rentType} rates must exceed Hamali ₹${hamaliRate}/bag`);
      }
    }
    const snapshots = await CommodityRateModel.find({ commodityId }).lean().exec();
    const results: CommodityRate[] = [];
    try {
      for (const r of rows) results.push(await this.upsertRate({ ...r, commodityId }));
      return results;
    } catch (err) {
      for (const snap of snapshots) {
        await CommodityRateModel.findOneAndUpdate(
          { commodityId, rentType: snap.rentType },
          { $set: { smallRate: snap.smallRate, bigRate: snap.bigRate, isActive: snap.isActive } },
        ).exec();
      }
      const added = snapshots.length === 0 ? [] : snapshots.map((s) => s.rentType);
      for (const r of rows) {
        if (!added.includes(r.rentType as never) && !snapshots.some((s) => s.rentType === (r.rentType as string))) {
          await CommodityRateModel.deleteOne({ commodityId, rentType: r.rentType }).exec();
        }
      }
      throw err;
    }
  }
}

export const commodityRateService = new CommodityRateService();
