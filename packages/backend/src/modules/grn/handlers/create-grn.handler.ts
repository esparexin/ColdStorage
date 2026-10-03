import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  getAuthoritativeWeight,
  rentMonthsForType,
  type CreateGrnInput,
  type Grn,
  type GrnAcknowledgement,
} from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { FacilityModel } from '../../../database/models/facility.model.js';
import { GrnModel, type GrnDoc } from '../../../database/models/grn.model.js';
import { auditService } from '../../audit/audit.service.js';
import { counterService } from '../../common/counter.service.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';
import { toGrnAcknowledgement, toGrnEntity } from '../grn.mappers.js';

export async function createGrn(
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

  // 4. Chamber is free text supplied by the operator, already length-validated by the contract.

  // 5. Inward Date and FY validation
  const inwardDate = validateOperationalDate(input.date, { label: 'Inward' });

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
            chamber: input.chamber.trim(),
            bags: input.bags,
            bagType: input.bagType,
            nominalUnitWeight: input.nominalUnitWeight ?? null,
            nominalTotalWeight,
            actualWeight: input.actualWeight ?? null,
            authoritativeWeight,
            rentType: input.rentType,
            rentMonths: rentMonthsForType(input.rentType) ?? input.rentMonths!,
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

  const grn = toGrnEntity(createdDoc!);
  const acknowledgement = toGrnAcknowledgement(grn);

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
      chamber: grn.chamber,
    },
  });

  return { grn, acknowledgement };
}
