import { randomUUID } from 'node:crypto';
import type { CreateCustomerInput, Customer, UpdateCustomerInput } from '@cold-storage/contracts';
import { CustomerModel } from '../../database/models/customer.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Name is the sole customer identifier. The previous mobile-keyed re-registration merge is gone:
 * a customer is created once and re-associated with a facility, never implicitly duplicated.
 */
export class CustomerService {
  public async createCustomer(
    { name: rawName, isActive }: Omit<CreateCustomerInput, 'facilityId'>,
    facilityIds: string[],
  ): Promise<Customer> {
    const name = rawName.trim();

    const facilityCount = await FacilityModel.countDocuments({ id: { $in: facilityIds } }).exec();
    if (facilityCount !== facilityIds.length) {
      throw new Error('One or more specified facility IDs do not exist');
    }

    const duplicateName = await CustomerModel.findOne({
      name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
      facilityIds: { $in: facilityIds },
    })
      .lean()
      .exec();
    if (duplicateName) {
      throw new Error(`Customer with name '${name}' already exists in this facility`);
    }

    const id = `cust-${randomUUID()}`;
    const doc = await CustomerModel.create({
      id,
      name,
      facilityIds,
      isActive: isActive ?? true,
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
    search?: string,
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

    if (search) {
      query.name = { $regex: escapeRegExp(search.trim()), $options: 'i' };
    }

    const docs = await CustomerModel.find(query).sort({ name: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  public async updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer | null> {
    const existing = await CustomerModel.findOne({ id }).exec();
    if (!existing) return null;

    if (input.name && input.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const name = input.name.trim();
      const duplicateName = await CustomerModel.findOne({
        name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
        facilityIds: { $in: existing.facilityIds },
        id: { $ne: id },
      })
        .lean()
        .exec();
      if (duplicateName) {
        throw new Error(`Customer with name '${name}' already exists in this facility`);
      }
      existing.name = name;
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
    facilityIds: string[];
    isActive: boolean;
  }): Customer {
    return {
      id: doc.id,
      name: doc.name,
      facilityIds: doc.facilityIds,
      isActive: doc.isActive,
    };
  }
}

export const customerService = new CustomerService();