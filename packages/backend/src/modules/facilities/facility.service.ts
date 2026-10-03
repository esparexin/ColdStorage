import { randomUUID } from 'node:crypto';
import type { CreateFacilityInput, Facility, UpdateFacilityInput } from '@cold-storage/contracts';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';

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

  /**
   * Lists facilities visible to the caller.
   *
   * `includeInactive` defaults to false so a deactivated facility stops appearing in operational
   * selectors. The settings table passes true so an operator can still see and reactivate it.
   */
  public async listFacilities(
    userFacilityIds: string[],
    isSuperAdmin = false,
    includeInactive = false,
  ): Promise<Facility[]> {
    const filter: Record<string, unknown> = isSuperAdmin ? {} : { id: { $in: userFacilityIds } };
    if (!includeInactive) {
      filter.isActive = true;
    }
    const docs = await FacilityModel.find(filter).sort({ name: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  /**
   * Permanently removes a facility.
   *
   * This repository has no soft-delete mechanism; the only established removal pattern is a
   * hard delete of the record itself (see assets/asset.service.ts). A facility is the tenancy and
   * access-scope root, so it is refused while any operational record still references it. Those
   * records are financial and audit history and must never be cascaded away silently.
   */
  public async deleteFacility(id: string): Promise<boolean> {
    const existing = await FacilityModel.findOne({ id }).lean().exec();
    if (!existing) {
      return false;
    }

    const [grns, inventory, rentPayments, assignedUsers] = await Promise.all([
      GrnModel.countDocuments({ facilityId: id }).exec(),
      InventoryTransactionModel.countDocuments({ facilityId: id }).exec(),
      RentPaymentModel.countDocuments({ facilityId: id }).exec(),
      FacilityModel.db.collection('users').countDocuments({ facilityIds: id }),
    ]);

    if (grns > 0 || inventory > 0 || rentPayments > 0) {
      throw new Error(
        `Facility cannot be deleted: it still has ${grns} inward receipts, ` +
          `${inventory} inventory transactions and ${rentPayments} rent payments. ` +
          'Deactivate it instead.',
      );
    }
    if (assignedUsers > 0) {
      throw new Error(
        `Facility cannot be deleted: ${assignedUsers} user account(s) are still assigned to it. ` +
          'Reassign them first, or deactivate the facility instead.',
      );
    }

    await FacilityModel.deleteOne({ id }).exec();
    return true;
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