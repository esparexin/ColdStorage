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
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
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
      // GR Number is operator-entered (four digits, contract-validated) and is the sole business key.
      // Uniqueness is per facility; the unique index is the concurrent-write backstop.
      const grnNumber = input.grnNumber;
      const existingGrn = await GrnModel.findOne({ facilityId, grnNumber }, null, { session });
      if (existingGrn) {
        throw new Error(`GRN '${grnNumber}' already exists for this facility.`);
      }

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
        inwardReceiptNumber = await counterService.generateInwardReceiptNumber(facilityId, inwardDate, session);
      }

      // Bond # is reference-only and is not minted per receipt: the GR Number is the sole business
      // key and is what the Bonds UI displays in the Bond # column. A value supplied by a legacy
      // CSV import is preserved as reference text; nothing new is generated.
      const bondNumber = input.isBondForLoan ? input.bondNumber?.trim() || null : null;

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
            bondNumber,
            isBondForLoan: Boolean(input.isBondForLoan),
            loanStatus: input.isBondForLoan ? (input.loanStatus && input.loanStatus !== 'NONE' ? input.loanStatus : 'NOT_TAKEN') : 'NONE',
            loanBankName: input.loanBankName?.trim() || null,
            loanReferenceNumber: input.loanReferenceNumber?.trim() || null,
            loanRemarks: input.loanRemarks?.trim() || null,
            loanTakenAt: input.isBondForLoan && input.loanStatus === 'TAKEN' ? inwardDate : null,
            loanClearedAt: null,
            createdBy: userId,
          },
        ],
        { session },
      );

      createdDoc = docs[0];

      // The inward leg of the stock ledger, written in the same transaction as the receipt it
      // describes. Without this row the ledger holds only outward movements and reversal, so any
      // balance summed from it is one-sided and goes negative the moment a facility records its
      // first delivery. Same transaction, so a receipt can never exist without its inward stock.
      await InventoryTransactionModel.create(
        [
          {
            id: `tx-${randomUUID()}`,
            facilityId,
            grnId: id,
            grnNumber,
            chamber: input.chamber.trim(),
            commodityId: commodity.id,
            bagType: input.bagType,
            transactionType: 'INWARD_PUTAWAY' as const,
            smallQuantity: composition.smallBags,
            bigQuantity: composition.bigBags,
            referenceType: 'PUT_AWAY' as const,
            referenceId: id,
            notes: null,
            createdBy: userId,
            // The movement happened at inward, not when this row happened to be written, so the
            // ledger timeline and the monthly inward report both agree with the receipt date.
            createdAt: inwardDate,
          },
        ],
        { session, ordered: true },
      );
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
      bondNumber: grn.bondNumber,
      bags: grn.bags,
      customerId: grn.customerId,
      chamber: grn.chamber,
    },
  });

  return { grn, acknowledgement };
}
