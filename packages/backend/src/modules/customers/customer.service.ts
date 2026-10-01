import { randomUUID } from 'node:crypto';
import type { CreateCustomerInput, Customer, UpdateCustomerInput } from '@cold-storage/contracts';
import { CustomerModel, type CustomerDoc } from '../../database/models/customer.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';

export class CustomerService {
  public async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const mobile = input.mobile.trim();

    // Verify all specified facilityIds exist
    const facilityCount = await FacilityModel.countDocuments({ id: { $in: input.facilityIds } }).exec();
    if (facilityCount !== input.facilityIds.length) {
      throw new Error('One or more specified facility IDs do not exist');
    }

    const existing = await CustomerModel.findOne({ mobile }).exec();
    if (existing) {
      // If customer already exists, associate any new facilities
      const newFacilities = input.facilityIds.filter((fid) => !existing.facilityIds.includes(fid));
      if (newFacilities.length === 0) {
        throw new Error(`Customer with mobile '${mobile}' is already registered for all requested facilities`);
      }
      existing.facilityIds.push(...newFacilities);
      if (input.name && input.name.trim() !== existing.name) {
        existing.name = input.name.trim();
      }
      if (input.address !== undefined) {
        existing.address = input.address?.trim() || null;
      }
      if (input.gstin !== undefined) {
        existing.gstin = input.gstin?.trim() ? input.gstin.trim().toUpperCase() : null;
      }
      await existing.save();
      return this.toEntity(existing);
    }

    const id = `cust-${randomUUID()}`;
    const doc = await CustomerModel.create({
      id,
      name: input.name.trim(),
      mobile,
      address: input.address?.trim() || null,
      gstin: input.gstin?.trim() ? input.gstin.trim().toUpperCase() : null,
      facilityIds: input.facilityIds,
      isActive: input.isActive ?? true,
    });

    return this.toEntity(doc);
  }

  public async getCustomerById(id: string): Promise<Customer | null> {
    const doc = await CustomerModel.findOne({ id }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  public async listCustomers(
    facilityId?: string,
    userFacilityIds: string[] = [],
    isSuperAdmin = false,
  ): Promise<Customer[]> {
    let query: Record<string, unknown> = {};

    if (facilityId) {
      if (!isSuperAdmin && !userFacilityIds.includes(facilityId)) {
        throw new Error(`Unauthorized access to facility '${facilityId}'`);
      }
      query = { facilityIds: facilityId };
    } else if (!isSuperAdmin) {
      query = { facilityIds: { $in: userFacilityIds } };
    }

    const docs = await CustomerModel.find(query).sort({ name: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  public async updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer | null> {
    const existing = await CustomerModel.findOne({ id }).exec();
    if (!existing) return null;

    if (input.mobile && input.mobile.trim() !== existing.mobile) {
      const mobile = input.mobile.trim();
      const duplicate = await CustomerModel.findOne({ mobile, id: { $ne: id } }).lean().exec();
      if (duplicate) {
        throw new Error(`Customer with mobile '${mobile}' already exists`);
      }
      existing.mobile = mobile;
    }

    if (input.name) {
      existing.name = input.name.trim();
    }

    if (input.address !== undefined) {
      existing.address = input.address?.trim() || null;
    }

    if (input.gstin !== undefined) {
      existing.gstin = input.gstin?.trim() ? input.gstin.trim().toUpperCase() : null;
    }

    if (input.facilityIds && input.facilityIds.length > 0) {
      const facilityCount = await FacilityModel.countDocuments({ id: { $in: input.facilityIds } }).exec();
      if (facilityCount !== input.facilityIds.length) {
        throw new Error('One or more specified facility IDs do not exist');
      }
      existing.facilityIds = input.facilityIds;
    }

    if (input.isActive !== undefined) {
      existing.isActive = input.isActive;
    }

    await existing.save();
    return this.toEntity(existing);
  }

  private toEntity(doc: CustomerDoc | (Customer & { _id?: unknown })): Customer {
    return {
      id: doc.id,
      name: doc.name,
      mobile: doc.mobile,
      address: doc.address || undefined,
      gstin: doc.gstin || undefined,
      facilityIds: doc.facilityIds,
      isActive: doc.isActive,
    };
  }
}

export const customerService = new CustomerService();
