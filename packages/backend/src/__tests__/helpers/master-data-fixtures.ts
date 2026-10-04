import { randomUUID } from 'node:crypto';
import type { BagType, DeliveryStatus } from '@cold-storage/contracts';
import { GrnModel } from '../../database/models/grn.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';

/**
 * Shared master-data fixtures for route and service tests.
 *
 * With chamber reduced to a free-text label there is no hierarchy to seed, so a GRN is created
 * directly from its inbound. These helpers are the single canonical way to do that, replacing
 * the per-file facility -> chamber -> rack -> level -> position fixture blocks.
 */

export interface SeedFacilityOptions {
  id?: string;
  name?: string;
  code?: string;
  address?: string | null;
  isActive?: boolean;
}

export async function seedFacility(options: SeedFacilityOptions = {}): Promise<string> {
  const id = options.id ?? `fac-${randomUUID()}`;
  await FacilityModel.findOneAndUpdate(
    { id },
    {
      $set: {
        code: options.code ?? id.slice(-8).toUpperCase(),
        name: options.name ?? `Facility ${id.slice(-4)}`,
        address: options.address ?? null,
        isActive: options.isActive ?? true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
  return id;
}

export interface SeedCustomerOptions {
  id?: string;
  name?: string;
  facilityId: string;
  isActive?: boolean;
}

export async function seedCustomer(options: SeedCustomerOptions): Promise<string> {
  const id = options.id ?? `cust-${randomUUID()}`;
  await CustomerModel.findOneAndUpdate(
    { id },
    {
      $set: {
        name: options.name ?? `Customer ${id.slice(-6)}`,
        facilityIds: [options.facilityId],
        isActive: options.isActive ?? true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
  return id;
}

export interface SeedGrnOptions {
  facilityId: string;
  customerId?: string;
  /** Denormalized label printed on the documents; the customer record is not joined. */
  customerName?: string;
  commodityId?: string;
  commodityName?: string;
  /** Free-text chamber label; never resolved against a managed entity. */
  chamber?: string;
  bags?: number;
  bagType?: BagType;
  rentAmount?: number;
  rentType?: 'Monthly' | 'Seasonal';
  /** Overrides the rent period; Monthly defaults to 1 and Seasonal to SEASONAL_MONTHS. */
  rentMonths?: number | null;
  status?: 'OPEN' | 'CLOSED';
  grnNumber?: string;
  inwardReceiptNumber?: string;
  vehicleNumber?: string | null;
  marks?: string | null;
  gpNumber?: string | null;
  remarks?: string | null;
  date?: Date;
}

/** Seasonal is always the fixed 10-month period. */
export const SEASONAL_MONTHS = 10;

export async function seedGrn(options: SeedGrnOptions): Promise<string> {
  const id = `grn-${randomUUID()}`;
  const rentType = options.rentType ?? 'Seasonal';
  const commodityId = options.commodityId ?? `cmd-${randomUUID()}`;

  await GrnModel.findOneAndUpdate(
    { id },
    {
      $set: {
        facilityId: options.facilityId,
        grnNumber: options.grnNumber ?? `GRN-26-27-${id.slice(-4).toUpperCase()}`,
        inwardReceiptNumber:
          options.inwardReceiptNumber ?? `RCPT-26-27-${id.slice(-4).toUpperCase()}`,
        date: options.date ?? new Date(),
        customerId: options.customerId ?? (await seedCustomer({ facilityId: options.facilityId })),
        customerName: options.customerName ?? `Customer ${id.slice(-6)}`,
        commodityId,
        commodityName: options.commodityName ?? 'Potato',
        chamber: options.chamber ?? 'CH-01',
        bags: options.bags ?? 100,
        bagType: options.bagType ?? 'S',
        nominalUnitWeight: null,
        nominalTotalWeight: null,
        actualWeight: null,
        authoritativeWeight: null,
        rentType,
        rentMonths:
          options.rentMonths !== undefined
            ? options.rentMonths
            : rentType === 'Seasonal'
              ? SEASONAL_MONTHS
              : 1,
        rentAmount: options.rentAmount ?? 0,
        gpNumber: options.gpNumber ?? null,
        marks: options.marks ?? null,
        vehicleNumber: options.vehicleNumber ?? null,
        remarks: options.remarks ?? null,
        status: options.status ?? 'OPEN',
        createdBy: 'usr-fixture',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();

  return id;
}

export interface SeedChallanOptions {
  facilityId: string;
  id?: string;
  challanNumber?: string;
  grnId?: string;
  grnNumber?: string;
  customerId?: string;
  customerName?: string;
  commodityId?: string;
  commodityName?: string;
  /** Free-text chamber label copied from the owning GRN. */
  chamber?: string;
  bags?: number;
  /** Whole-lot put-away means a challan starts by dispatching everything; defaults to `bags`. */
  totalBags?: number;
  vehicleNumber?: string | null;
  driverName?: string | null;
  issuedBy?: string;
  status?: DeliveryStatus;
}

/** Outward gate pass. With no storage positions left there is one bag count, not an item list. */
export async function seedChallan(options: SeedChallanOptions): Promise<string> {
  const id = options.id ?? `chl-${randomUUID()}`;
  const bags = options.bags ?? 100;

  await DeliveryChallanModel.findOneAndUpdate(
    { id },
    {
      $set: {
        facilityId: options.facilityId,
        challanNumber: options.challanNumber ?? `CHL-26-27-${id.slice(-4).toUpperCase()}`,
        date: new Date(),
        grnId: options.grnId ?? `grn-${randomUUID()}`,
        grnNumber: options.grnNumber ?? 'GRN-26-27-0000',
        customerId: options.customerId ?? `cust-${randomUUID()}`,
        customerName: options.customerName ?? `Customer ${id.slice(-6)}`,
        commodityId: options.commodityId ?? `cmd-${randomUUID()}`,
        commodityName: options.commodityName ?? 'Potato',
        chamber: options.chamber ?? 'CH-01',
        bags,
        totalBags: options.totalBags ?? bags,
        vehicleNumber: options.vehicleNumber ?? null,
        driverName: options.driverName ?? null,
        weight: null,
        remarks: null,
        status: options.status ?? 'ISSUED',
        issuedBy: options.issuedBy ?? 'usr-fixture',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();

  return id;
}

/** Seeds a facility plus one GRN already rented, the usual precondition for stock movements. */
export async function seedRentSettledGrn(options: SeedGrnOptions = { facilityId: '' }): Promise<{
  facilityId: string;
  grnId: string;
}> {
  const facilityId = options.facilityId || (await seedFacility());
  const grnId = await seedGrn({ ...options, facilityId, rentAmount: 5000, rentType: 'Seasonal' });
  return { facilityId, grnId };
}
