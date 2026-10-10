import { randomUUID } from 'node:crypto';
import type {
  CommodityRate,
  RentType,
  UpsertCommodityRateInput,
} from '@cold-storage/contracts';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CommodityRateModel, type CommodityRateDoc } from '../../database/models/commodity-rate.model.js';

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

    const update = {
      smallRate: input.smallRate,
      bigRate: input.bigRate,
      isActive: input.isActive ?? true,
    };

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
    const doc = await CommodityRateModel.findOne({ commodityId, rentType, isActive: true })
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
   * Resolution helper for Phases 3–4: returns the active authoritative row or
   * throws, so GRN creation and period finalization can validate submitted
   * rates against the Price Controller instead of trusting client input.
   */
  public async resolveAuthoritativeRate(
    commodityId: string,
    rentType: RentType,
  ): Promise<CommodityRate> {
    const rate = await this.getRate(commodityId, rentType);
    if (!rate) {
      throw new Error(
        `No active ${rentType} rate configured for commodity '${commodityId}'`,
      );
    }
    return rate;
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
   * When an active row exists for (commodity, rent type), explicitly submitted
   * small/big rates must equal it exactly (2dp); anything else is a stale or
   * tampered submission and is rejected. When no active row exists the legacy
   * path is preserved untouched so unconfigured commodities, historical flows,
   * and bulk imports keep working — the Inward UI blocks submission until a
   * rate is configured, so this fallback is a backstop, not an editing path.
   */
  public async validateSubmittedRates(
    commodityId: string,
    rentType: RentType,
    submitted: { smallBagPrice?: number | null; bigBagPrice?: number | null },
  ): Promise<void> {
    if (submitted.smallBagPrice == null && submitted.bigBagPrice == null) return;
    const rate = await this.getRate(commodityId, rentType);
    if (!rate) return;
    const norm = (n: number) => Number(n.toFixed(2));
    const mismatch =
      (submitted.smallBagPrice != null && norm(submitted.smallBagPrice) !== norm(rate.smallRate)) ||
      (submitted.bigBagPrice != null && norm(submitted.bigBagPrice) !== norm(rate.bigRate));
    if (mismatch) {
      throw new Error(
        `Submitted bag rates do not match the active ${rentType} controller rate for commodity '${commodityId}' (Small ₹${rate.smallRate}, Big ₹${rate.bigRate})`,
      );
    }
  }

  private toEntity(doc: CommodityRateDoc | CommodityRate): CommodityRate {
    return {
      id: doc.id,
      commodityId: doc.commodityId,
      rentType: doc.rentType,
      smallRate: doc.smallRate,
      bigRate: doc.bigRate,
      isActive: doc.isActive,
    };
  }
}

export const commodityRateService = new CommodityRateService();
