import { randomUUID } from 'node:crypto';
import type { CreateFacilityInput, Facility, UpdateFacilityInput } from '@cold-storage/contracts';
import { ChamberModel } from '../../database/models/chamber.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';

export class FacilityService {
  public async createFacility(input: CreateFacilityInput): Promise<Facility> {
    const code = input.code.trim().toUpperCase();
    const existing = await FacilityModel.findOne({ code }).lean().exec();
    if (existing) {
      throw new Error(`Facility with code '${code}' already exists`);
    }

    const id = `fac-${randomUUID()}`;
    const doc = await FacilityModel.create({
      id,
      code,
      name: input.name.trim(),
      address: input.address?.trim() || null,
      isActive: input.isActive ?? true,
    });

    return this.toEntity(doc);
  }

  public async getFacilityById(id: string): Promise<Facility | null> {
    const doc = await FacilityModel.findOne({ id }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  public async listFacilities(userFacilityIds: string[], isSuperAdmin = false): Promise<Facility[]> {
    const filter = isSuperAdmin ? {} : { id: { $in: userFacilityIds } };
    const docs = await FacilityModel.find(filter).sort({ name: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  public async updateFacility(id: string, input: UpdateFacilityInput): Promise<Facility | null> {
    const existing = await FacilityModel.findOne({ id }).exec();
    if (!existing) {
      return null;
    }

    if (input.code && input.code.trim().toUpperCase() !== existing.code) {
      const code = input.code.trim().toUpperCase();
      const duplicate = await FacilityModel.findOne({ code, id: { $ne: id } }).lean().exec();
      if (duplicate) {
        throw new Error(`Facility with code '${code}' already exists`);
      }
      existing.code = code;
    }

    if (input.name) {
      existing.name = input.name.trim();
    }

    if (input.address !== undefined) {
      existing.address = input.address?.trim() || null;
    }

    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      if (!input.isActive) {
        // Enforce bottom-up deactivation: cannot deactivate facility with active chambers
        const activeChambers = await ChamberModel.countDocuments({ facilityId: id, isActive: true }).exec();
        if (activeChambers > 0) {
          throw new Error('Cannot deactivate facility while it contains active chambers');
        }
      }
      existing.isActive = input.isActive;
    }

    await existing.save();
    return this.toEntity(existing);
  }

  private toEntity(doc: {
    id: string;
    code: string;
    name: string;
    address?: string | null;
    isActive: boolean;
  }): Facility {
    return {
      id: doc.id,
      code: doc.code,
      name: doc.name,
      address: doc.address || undefined,
      isActive: doc.isActive,
    };
  }
}

export const facilityService = new FacilityService();
