import { randomUUID } from 'node:crypto';
import type { CreateFacilityInput, Facility, UpdateFacilityInput } from '@cold-storage/contracts';
import { FacilityModel } from '../../database/models/facility.model.js';

/**
 * Facility is the tenancy and access-scope root. It owns no storage hierarchy: chambers are
 * free-text labels carried on each GRN, so there is no child structure to guard on deactivate.
 *
 * Records are maintained by SUPER_ADMIN only; reads are open to any role scoped to a facility.
 */
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

    if (input.isActive !== undefined) {
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