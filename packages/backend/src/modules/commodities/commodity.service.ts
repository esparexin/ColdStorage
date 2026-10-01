import { randomUUID } from 'node:crypto';
import type { Commodity, CreateCommodityInput, UpdateCommodityInput } from '@cold-storage/contracts';
import { CommodityModel, type CommodityDoc } from '../../database/models/commodity.model.js';

export class CommodityService {
  public async createCommodity(input: CreateCommodityInput): Promise<Commodity> {
    const name = input.name.trim();
    const normalizedName = name.toLowerCase();

    const existing = await CommodityModel.findOne({ normalizedName }).lean().exec();
    if (existing) {
      throw new Error(`Commodity with name '${name}' already exists`);
    }

    const id = `cmd-${randomUUID()}`;
    const doc = await CommodityModel.create({
      id,
      name,
      normalizedName,
      isActive: input.isActive ?? true,
    });

    return this.toEntity(doc);
  }

  public async getCommodityById(id: string): Promise<Commodity | null> {
    const doc = await CommodityModel.findOne({ id }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  public async listCommodities(): Promise<Commodity[]> {
    const docs = await CommodityModel.find().sort({ name: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
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

    if (input.isActive !== undefined) {
      existing.isActive = input.isActive;
    }

    await existing.save();
    return this.toEntity(existing);
  }

  private toEntity(doc: CommodityDoc | (Commodity & { _id?: unknown })): Commodity {
    return {
      id: doc.id,
      name: doc.name,
      isActive: doc.isActive,
    };
  }
}

export const commodityService = new CommodityService();
