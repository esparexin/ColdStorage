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
