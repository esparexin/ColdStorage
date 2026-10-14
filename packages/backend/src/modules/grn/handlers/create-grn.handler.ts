import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  buildInwardReceiptNumber,
  calculateRentAmount,
  getFinancialYearKey,
  normalizeBagComposition,
  rentMonthsForType,
  type CreateGrnInput,
  type Grn,
  type GrnAcknowledgement,
} from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { FacilityModel } from '../../../database/models/facility.model.js';
import { GrnModel, type GrnDoc } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { auditService } from '../../audit/audit.service.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';
import { commodityRateService } from '../../commodities/commodity-rate.service.js';
import { toGrnAcknowledgement, toGrnEntity } from '../grn.mappers.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';

export interface CreateGrnOptions {
  /** Fail closed when true (interactive writes). False keeps the CSV legacy path. */
  requireRates?: boolean;
}

export async function createGrn(
  facilityId: string,
  input: CreateGrnInput,
  userId: string,
  opts?: CreateGrnOptions,
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

  // 4b. Price Controller authority: agreed rates and lump sums must match the
  // active controller row when one exists; otherwise the legacy path applies.
  const { bagType, smallBagPrice, bigBagPrice, bagPrice, rentAmount, bags, smallBags, bigBags } = input;
  await commodityRateService.validateSubmittedRates(
    input.commodityId, input.rentType,
    { bagType, smallBagPrice, bigBagPrice, bagPrice, rentAmount, bags, smallBags, bigBags, rentMonths: input.rentMonths },
    { requireRates: opts?.requireRates ?? true },
  );

  // 5. Inward Date and FY validation
  const inwardDate = validateOperationalDate(input.date, { label: 'Inward' });

  // 6. Bag composition is resolved once, here, and stored as the authoritative split, so `bags`
  // and its parts can never drift apart.
  const composition = normalizeBagComposition({
    bagType: input.bagType,
    bags: input.bags,
    smallBags: input.smallBags,
    bigBags: input.bigBags,
  });

  // Per-bag weight is optional: the Inward form captures Total Bags and a single Bag Price.
  // A supplied weight is preserved for that bag type; an absent one is stored as null.
  const smallBagWeight = input.smallBagWeight ?? null, bigBagWeight = input.bigBagWeight ?? null;

  const rentMonths = rentMonthsForType(input.rentType) ?? (input.rentMonths ?? null);
  const isSeasonal = input.rentType === 'Seasonal' || input.rentType === 'Seasonal_3M';
  const hasFixedMonthlyDuration = input.rentType === 'Monthly' && typeof rentMonths === 'number' && rentMonths >= 1;

  let finalRentAmount = input.rentAmount ?? null;
  if (finalRentAmount == null && (isSeasonal || hasFixedMonthlyDuration)) {
    finalRentAmount = calculateRentAmount({
      rentType: input.rentType, bags: input.bags, bagType: input.bagType,
      smallBags: input.smallBags ?? null, bigBags: input.bigBags ?? null,
      smallBagPrice: input.smallBagPrice ?? null, bigBagPrice: input.bigBagPrice ?? null,
      bagPrice: input.bagPrice ?? null, rentMonths, rentAmount: null,
    });
  }
  finalRentAmount = finalRentAmount != null && finalRentAmount > 0 ? finalRentAmount : 0;
  const isHamaliApp = commodity.isHamaliApplicable ?? ((commodity.hamaliRate ?? 0) > 0);
  const hamaliRate = isHamaliApp ? (commodity.hamaliRate ?? 0) : 0;
  const hamaliAmount = Number((input.bags * hamaliRate).toFixed(2));

  const id = `grn-${randomUUID()}`;

  // 7. Atomic transaction for counter increments and GRN persistence
  const session = await mongoose.startSession();
  let createdDoc: GrnDoc;

  try {
    
  } finally {
    await session.endSession();
  }

  const grn = toGrnEntity(createdDoc!);
  const acknowledgement = toGrnAcknowledgement(grn);

  await auditService.log({
    eventType: 'GRN_CREATED', severity: 'INFO', userId, facilityId, resource: 'grn', resourceId: grn.id,
    details: { grnNumber: grn.grnNumber, bondNumber: grn.bondNumber, bags: grn.bags, customerId: grn.customerId, chamber: grn.chamber },
  });

  return { grn, acknowledgement };
}
