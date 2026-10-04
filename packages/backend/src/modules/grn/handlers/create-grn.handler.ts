import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  calculateRentAmount,
  deriveBagPrice,
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
import { auditService } from '../../audit/audit.service.js';
import { counterService, DOCUMENT_PREFIXES } from '../../common/counter.service.js';
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

  // 6. Bag composition is resolved once, here, and stored as the authoritative split. `bags` is
  // already the sum of these two parts by contract validation, so the total is never a third
  // independent figure that can drift from them.
  const composition = normalizeBagComposition({
    bagType: input.bagType,
    bags: input.bags,
    smallBags: input.smallBags,
    bigBags: input.bigBags,
  });

  // Per-bag weight accounting (no nominal/weighbridge/total derivation).
  // Small Bag Weight belongs to the individual small bag; Big Bag Weight to the big bag.
  const smallBagWeight = input.smallBagWeight ?? null;
  const bigBagWeight = input.bigBagWeight ?? null;

  // Rent Months is informational only and is not used to finalize the monthly
  // subscription/payment logic beyond the established rent-amount rule.
  const rentMonths = rentMonthsForType(input.rentType) ?? input.rentMonths!;
  const derivedBagPrice = deriveBagPrice({
    rentType: input.rentType,
    bags: input.bags,
    bagPrice: input.bagPrice,
    rentMonths,
    rentAmount: input.rentAmount,
  });
  const finalRentAmount =
    input.rentAmount && input.rentAmount > 0
      ? input.rentAmount
      : calculateRentAmount({
          rentType: input.rentType,
          bags: input.bags,
          bagType: input.bagType,
          bagPrice: input.bagPrice ?? derivedBagPrice,
          smallBags: composition.smallBags,
          bigBags: composition.bigBags,
          smallBagPrice: input.smallBagPrice,
          bigBagPrice: input.bigBagPrice,
          rentMonths,
          rentAmount: input.rentAmount,
        });

  const id = `grn-${randomUUID()}`;

  // 7. Atomic transaction for counter increments and GRN persistence
  const session = await mongoose.startSession();
  let createdDoc: GrnDoc;

  try {
    await session.withTransaction(async () => {
      const grnNumber = await counterService.generateGrnNumber(facilityId, inwardDate, session);
      let inwardReceiptNumber: string;
      const customBill = input.billNumber?.trim();
      if (customBill) {
        const isNumeric = /^\d+$/.test(customBill);
        const fy = getFinancialYearKey(inwardDate);
        inwardReceiptNumber = isNumeric
          ? `${DOCUMENT_PREFIXES.inwardReceipt}-${fy}-${customBill.padStart(4, '0')}`
          : customBill;

        const existing = await GrnModel.findOne({ facilityId, inwardReceiptNumber }, null, { session });
        if (existing) {
          throw new Error(`Bill Number '${inwardReceiptNumber}' already exists for this facility.`);
        }

        const seqMatch = inwardReceiptNumber.match(/(\d+)$/);
        if (seqMatch) {
          const seqNum = parseInt(seqMatch[1], 10);
          if (seqNum > 0) {
            await counterService.syncInwardReceiptSequence(facilityId, inwardDate, seqNum, session);
          }
        }
      } else {
        inwardReceiptNumber = await counterService.generateInwardReceiptNumber(
          facilityId,
          inwardDate,
          session,
        );
      }

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
            smallBags: composition.smallBags,
            bigBags: composition.bigBags,
            smallBagWeight,
            bigBagWeight,
            rentType: input.rentType,
            rentMonths,
            rentAmount: finalRentAmount,
            bagPrice: input.bagPrice ?? derivedBagPrice ?? null,
            smallBagPrice: input.smallBagPrice ?? null,
            bigBagPrice: input.bigBagPrice ?? null,
            gpNumber: input.gpNumber?.trim() || null,
            storageMark: input.storageMark?.trim() || null,
            partyMark: input.partyMark?.trim() || null,
            marks: input.marks?.trim() || [input.storageMark?.trim(), input.partyMark?.trim()].filter(Boolean).join(' / ') || null,
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
