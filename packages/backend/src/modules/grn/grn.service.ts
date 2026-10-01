import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  getAuthoritativeWeight,
  getFinancialYearKey,
  type CreateGrnInput,
  type Grn,
  type GrnAcknowledgement,
  type GrnQuery,
} from '@cold-storage/contracts';
import { ChamberModel } from '../../database/models/chamber.model.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel, type GrnDoc } from '../../database/models/grn.model.js';
import { counterService } from './counter.service.js';
import { auditService } from '../audit/audit.service.js';

export class GrnService {
  public async createGrn(
    facilityId: string,
    input: CreateGrnInput,
    userId: string,
  ): Promise<{ grn: Grn; acknowledgement: GrnAcknowledgement }> {
    // 1. Verify Facility exists and is active
    const facility = await FacilityModel.findOne({ id: facilityId }).lean().exec();
    if (!facility) {
      throw new Error(`Facility '${facilityId}' not found`);
    }
    if (!facility.isActive) {
      throw new Error(`Facility '${facility.name}' is inactive`);
    }

    // 2. Verify Customer exists, is active, and is assigned to facility
    const customer = await CustomerModel.findOne({ id: input.customerId }).lean().exec();
    if (!customer) {
      throw new Error(`Customer '${input.customerId}' not found`);
    }
    if (!customer.isActive) {
      throw new Error(`Customer '${customer.name}' is inactive`);
    }
    if (!customer.facilityIds.includes(facilityId)) {
      throw new Error(`Customer '${customer.name}' is not registered for facility '${facilityId}'`);
    }

    // 3. Verify Commodity exists and is active
    const commodity = await CommodityModel.findOne({ id: input.commodityId }).lean().exec();
    if (!commodity) {
      throw new Error(`Commodity '${input.commodityId}' not found`);
    }
    if (!commodity.isActive) {
      throw new Error(`Commodity '${commodity.name}' is inactive`);
    }

    // 4. Verify Chamber exists in facility and is active
    const chamber = await ChamberModel.findOne({ id: input.chamberId }).lean().exec();
    if (!chamber) {
      throw new Error(`Chamber '${input.chamberId}' not found`);
    }
    if (chamber.facilityId !== facilityId) {
      throw new Error(
        `Chamber '${chamber.chamberNumber}' does not belong to facility '${facilityId}'`,
      );
    }
    if (!chamber.isActive) {
      throw new Error(`Chamber '${chamber.chamberNumber}' is inactive`);
    }

    // 5. Inward Date and FY validation
    const inwardDate = new Date(input.date);
    const now = new Date();
    const maxFutureAllowed = new Date(now.getTime() + 5 * 60 * 1000);
    if (inwardDate > maxFutureAllowed) {
      throw new Error('Inward date cannot be in the future');
    }

    const currentFy = getFinancialYearKey(now);
    const inwardFy = getFinancialYearKey(inwardDate);
    if (inwardFy !== currentFy) {
      throw new Error(
        `Inward date belongs to Financial Year '${inwardFy}', but current active FY is '${currentFy}'`,
      );
    }

    const maxPastAllowed = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (inwardDate < maxPastAllowed) {
      throw new Error('Inward date exceeds permitted 30-day operational backdating window');
    }

    // 6. Weight accounting
    const nominalTotalWeight =
      input.nominalTotalWeight ??
      (input.nominalUnitWeight ? input.bags * input.nominalUnitWeight : null);

    const authoritativeWeight = getAuthoritativeWeight({
      bagType: input.bagType,
      bags: input.bags,
      nominalUnitWeight: input.nominalUnitWeight ?? null,
      nominalTotalWeight,
      actualWeight: input.actualWeight ?? null,
    });

    const id = `grn-${randomUUID()}`;

    // 7. Atomic transaction for counter increments and GRN persistence
    const session = await mongoose.startSession();
    let createdDoc: GrnDoc;

    try {
      await session.withTransaction(async () => {
        const grnNumber = await counterService.generateGrnNumber(facilityId, inwardDate, session);
        const inwardReceiptNumber = await counterService.generateInwardReceiptNumber(
          facilityId,
          inwardDate,
          session,
        );

        const docs = await GrnModel.create(
          [
            {
              id,
              facilityId,
              grnNumber,
              inwardReceiptNumber,
              date: inwardDate,
              customerId: customer.id,
              customerName: customer.name,
              commodityId: commodity.id,
              commodityName: commodity.name,
              chamberId: chamber.id,
              chamberNumber: chamber.chamberNumber,
              bags: input.bags,
              bagType: input.bagType,
              nominalUnitWeight: input.nominalUnitWeight ?? null,
              nominalTotalWeight,
              actualWeight: input.actualWeight ?? null,
              authoritativeWeight,
              rentType: input.rentType,
              rentMonths: input.rentType === 'Monthly' ? input.rentMonths! : null,
              rentAmount: input.rentAmount,
              gpNumber: input.gpNumber?.trim() || null,
              marks: input.marks?.trim() || null,
              vehicleNumber: input.vehicleNumber?.trim().toUpperCase() || null,
              remarks: input.remarks?.trim() || null,
              status: 'OPEN',
              createdBy: userId,
            },
          ],
          { session },
        );

        createdDoc = docs[0];
      });
    } finally {
      await session.endSession();
    }

    const grn = this.toEntity(createdDoc!);
    const acknowledgement = this.toAcknowledgement(grn);

    await auditService.log({
      eventType: 'GRN_CREATED',
      severity: 'INFO',
      userId,
      facilityId,
      resource: 'grn',
      resourceId: grn.id,
      details: {
        grnNumber: grn.grnNumber,
        bags: grn.bags,
        customerId: grn.customerId,
      },
    });

    return { grn, acknowledgement };
  }

  public async getGrnById(id: string): Promise<Grn | null> {
    const doc = await GrnModel.findOne({ id }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  public async getAcknowledgementByGrnId(id: string): Promise<GrnAcknowledgement | null> {
    const grn = await this.getGrnById(id);
    return grn ? this.toAcknowledgement(grn) : null;
  }

  public async listGrns(
    facilityId: string,
    query: GrnQuery,
  ): Promise<{ items: Grn[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = { facilityId };

    if (query.customerId) {
      filter.customerId = query.customerId;
    }
    if (query.commodityId) {
      filter.commodityId = query.commodityId;
    }
    if (query.chamberId) {
      filter.chamberId = query.chamberId;
    }
    if (query.status) {
      filter.status = query.status;
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      GrnModel.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      GrnModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.toEntity(d)),
      total,
      page,
      limit,
    };
  }

  public async resolveFacilityIdForGrn(grnId: string): Promise<string | null> {
    const doc = await GrnModel.findOne({ id: grnId }).select('facilityId').lean().exec();
    return doc ? doc.facilityId : null;
  }

  private toEntity(doc: {
    id: string;
    facilityId: string;
    grnNumber: string;
    inwardReceiptNumber: string;
    date: Date;
    customerId: string;
    customerName: string;
    commodityId: string;
    commodityName: string;
    chamberId: string;
    chamberNumber: string;
    bags: number;
    bagType: string;
    nominalUnitWeight?: number | null;
    nominalTotalWeight?: number | null;
    actualWeight?: number | null;
    authoritativeWeight?: number | null;
    rentType: string;
    rentMonths?: number | null;
    rentAmount: number;
    gpNumber?: string | null;
    marks?: string | null;
    vehicleNumber?: string | null;
    remarks?: string | null;
    status: string;
    createdBy: string;
    createdAt?: Date;
    updatedAt?: Date;
  }): Grn {
    return {
      id: doc.id,
      facilityId: doc.facilityId,
      grnNumber: doc.grnNumber,
      inwardReceiptNumber: doc.inwardReceiptNumber,
      date: doc.date,
      customerId: doc.customerId,
      customerName: doc.customerName,
      commodityId: doc.commodityId,
      commodityName: doc.commodityName,
      chamberId: doc.chamberId,
      chamberNumber: doc.chamberNumber,
      bags: doc.bags,
      bagType: doc.bagType as Grn['bagType'],
      nominalUnitWeight: doc.nominalUnitWeight ?? null,
      nominalTotalWeight: doc.nominalTotalWeight ?? null,
      actualWeight: doc.actualWeight ?? null,
      authoritativeWeight: doc.authoritativeWeight ?? null,
      rentType: doc.rentType as Grn['rentType'],
      rentMonths: doc.rentMonths ?? null,
      rentAmount: doc.rentAmount,
      gpNumber: doc.gpNumber ?? null,
      marks: doc.marks ?? null,
      vehicleNumber: doc.vehicleNumber ?? null,
      remarks: doc.remarks ?? null,
      status: doc.status as Grn['status'],
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toAcknowledgement(grn: Grn): GrnAcknowledgement {
    return {
      grnId: grn.id,
      facilityId: grn.facilityId,
      grnNumber: grn.grnNumber,
      inwardReceiptNumber: grn.inwardReceiptNumber,
      inwardDate: grn.date,
      customer: {
        id: grn.customerId,
        name: grn.customerName,
      },
      commodity: {
        id: grn.commodityId,
        name: grn.commodityName,
      },
      storageLocation: {
        chamberId: grn.chamberId,
        chamberNumber: grn.chamberNumber,
      },
      bagAccounting: {
        bags: grn.bags,
        bagType: grn.bagType,
        nominalUnitWeight: grn.nominalUnitWeight,
        nominalTotalWeight: grn.nominalTotalWeight,
        actualWeight: grn.actualWeight,
        authoritativeWeight: grn.authoritativeWeight,
      },
      rentTerms: {
        rentType: grn.rentType,
        rentMonths: grn.rentMonths,
        rentAmount: grn.rentAmount,
      },
      transport: {
        gpNumber: grn.gpNumber,
        marks: grn.marks,
        vehicleNumber: grn.vehicleNumber,
      },
      remarks: grn.remarks,
      status: grn.status,
      issuedBy: grn.createdBy,
      issuedAt: grn.createdAt ?? new Date(),
    };
  }
}

export const grnService = new GrnService();
