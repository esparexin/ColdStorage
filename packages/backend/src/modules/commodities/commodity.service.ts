import { randomUUID } from 'node:crypto';
import type {
  Commodity,
  CommodityRate,
  CreateCommodityInput,
  UpdateCommodityInput,
} from '@cold-storage/contracts';
import { CommodityRateModel, type CommodityRateDoc } from '../../database/models/commodity-rate.model.js';
import { commodityRateService } from './commodity-rate.service.js';
import { CommodityModel } from '../../database/models/commodity.model.js';

export class CommodityService {
  public async createCommodity(input: CreateCommodityInput): Promise<Commodity> {
    const name = input.name.trim();
    const normalizedName = name.toLowerCase();

    const existing = await CommodityModel.findOne({ normalizedName }).lean().exec();
    if (existing) {
      throw new Error(`Commodity with name '${name}' already exists`);
    }

    const isHamaliApplicable = input.isHamaliApplicable ?? (input.hamaliRate !== undefined && input.hamaliRate > 0);
    const hamaliRate = isHamaliApplicable ? (input.hamaliRate ?? 0) : 0;

    const id = `cmd-${randomUUID()}`;
    const doc = await CommodityModel.create({
      id,
      name,
      normalizedName,
      seasonDuration: input.seasonDuration ?? 'Seasonal',
      isHamaliApplicable,
      hamaliRate,
      isActive: input.isActive ?? true,
    });

    return this.toEntity(doc);
  }

  public async getCommodityById(id: string): Promise<Commodity | null> {
    const doc = await CommodityModel.findOne({ id }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  /**
   * Lists commodities WITH their rate rows.
   *
   * The rates are included so a client rendering the commodities table needs a
   * single request. The previous contract had the screen issue one extra
   * `GET /api/commodities/:id/rates` per commodity in a Promise.all, turning one
   * page into 1 + N requests; every one of those also had to pass through the
   * 401-refresh path independently.
   */
  public async listCommodities(): Promise<Commodity[]> {
    const [docs, allRates] = await Promise.all([
      CommodityModel.find().sort({ name: 1 }).lean().exec(),
      CommodityRateModel.find().sort({ rentType: 1 }).lean<CommodityRateDoc[]>().exec(),
    ]);
    const ratesByCommodity = new Map<string, CommodityRate[]>();
    for (const doc of allRates) {
      const entity = commodityRateService.toEntity(doc);
      const existing = ratesByCommodity.get(entity.commodityId);
      if (existing) existing.push(entity);
      else ratesByCommodity.set(entity.commodityId, [entity]);
    }
    return docs.map((d) => ({ ...this.toEntity(d), rates: ratesByCommodity.get(d.id) ?? [] }));
  }

  public async updateCommodity(id: string, input: UpdateCommodityInput): Promise<Commodity | null> {
    const existing = await CommodityModel.findOne({ id }).exec();
    if (!existing) return null;

    if (input.name && input.name.trim().toLowerCase() !== existing.normalizedName) {
      const name = input.name.trim();
      const normalizedName = name.toLowerCase();

      const duplicate = await CommodityModel.findOne({ normalizedName, id: { $ne: id } }).lean().exec();
      if (duplicate) {
        throw new Error(`Commodity with name '${name}' already exists`);
      }

      existing.name = name;
      existing.normalizedName = normalizedName;
    }

    if (input.seasonDuration !== undefined) {
      existing.seasonDuration = input.seasonDuration;
    }

    if (input.isHamaliApplicable !== undefined) {
      existing.isHamaliApplicable = input.isHamaliApplicable;
      if (!input.isHamaliApplicable) {
        existing.hamaliRate = 0;
      }
    }

    if (input.hamaliRate !== undefined && existing.isHamaliApplicable !== false) {
      existing.hamaliRate = input.hamaliRate;
    }

    if (input.isActive !== undefined) {
      existing.isActive = input.isActive;
    }

    await existing.save();
    return this.toEntity(existing);
  }

  private toEntity(doc: {
    id: string;
    name: string;
    seasonDuration?: 'Seasonal' | 'Seasonal_3M';
    isHamaliApplicable?: boolean;
    hamaliRate?: number;
    isActive: boolean;
  }): Commodity {
    const isHamaliApplicable = doc.isHamaliApplicable ?? ((doc.hamaliRate ?? 0) > 0);
    return {
      id: doc.id,
      name: doc.name,
      seasonDuration: doc.seasonDuration ?? 'Seasonal',
      isHamaliApplicable,
      hamaliRate: isHamaliApplicable ? (doc.hamaliRate ?? 0) : 0,
      isActive: doc.isActive,
    };
  }
}

export const commodityService = new CommodityService();
