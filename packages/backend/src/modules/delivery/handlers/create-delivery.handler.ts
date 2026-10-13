import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  isHybridBagCategory, type BagComposition, type CreateDeliveryInput,
  type DeliveryChallan, type DeliverySummary,
} from '@cold-storage/contracts';
import { ConcurrencyConflictError } from '../../inventory/inventory.service.js';
import { counterService } from '../../common/counter.service.js';
import { DeliveryChallanModel, type DeliveryChallanDoc } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { auditService } from '../../audit/audit.service.js';
import { assertRentAllowedForOutward } from '../../common/rent-gate.service.js';
import { isTransientError, toChallanEntity } from '../delivery.mappers.js';
import { getDeliverySummary } from '../queries/delivery.queries.js';
import { computeExpectedDeliveryRent } from './delivery-rent.helper.js';
import { resolveFirstSeasonOutwardShare } from './delivery-hamali.helper.js';
import { recordDeliveryInlinePayment } from './delivery-payment.helper.js';
import { validateDeliveryDate, validateStockAndBalances } from './delivery-validation.helper.js';

export async function createDeliveryWithRetry(
  facilityId: string,
  input: CreateDeliveryInput,
  userId: string,
): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary }> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      return await executeDeliveryTransaction(facilityId, input, userId);
    } catch (err: unknown) {
      if (isTransientError(err) && attempt < maxRetries) {
        const delayMs = 50 * Math.pow(2, attempt) + Math.floor(Math.random() * 25);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (isTransientError(err)) {
        throw new ConcurrencyConflictError();
      }

      throw err;
    }
  }

  throw new ConcurrencyConflictError();
}

async function executeDeliveryTransaction(
  facilityId: string,
  input: CreateDeliveryInput,
  userId: string,
): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary }> {
  const session = await mongoose.startSession();
  let createdChallanDoc: DeliveryChallanDoc;

  try {
    await session.withTransaction(async () => {
      const grn = await GrnModel.findOneAndUpdate(
        { id: input.grnId, facilityId },
        { $set: { updatedAt: new Date() } },
        { session, new: true },
      ).lean().exec();

      if (!grn) {
        throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
      }
      if (grn.status === 'CLOSED') {
        throw new Error(`Cannot create delivery: GRN '${grn.grnNumber}' is CLOSED`);
      }
      if (grn.loanStatus === 'TAKEN') {
        const bondRef = grn.bondNumber ? `Bond ${grn.bondNumber} (GRN: ${grn.grnNumber})` : `GRN ${grn.grnNumber}`;
        throw new Error(`Outward blocked — Active loan hold against ${bondRef}`);
      }

      const isHybrid = isHybridBagCategory(input.bagCategory);
      const hasSpecificBags = (input.smallBags ?? 0) > 0 || (input.bigBags ?? 0) > 0;
      const reqQty = input.quantity ?? 0;
      const resSmall = hasSpecificBags ? (input.smallBags ?? 0) : grn.bagType === 'B' ? 0 : reqQty;
      const resBig = hasSpecificBags ? (input.bigBags ?? 0) : grn.bagType === 'B' ? reqQty : 0;
      const withdrawal: BagComposition = {
        smallBags: isHybrid && !hasSpecificBags ? 0 : resSmall,
        bigBags: isHybrid && !hasSpecificBags ? 0 : resBig,
      };

      const available = await validateStockAndBalances(
        facilityId,
        grn,
        withdrawal,
        session,
        isHybrid,
        reqQty,
      );
      const finalSmall = withdrawal.smallBags;
      const finalBig = withdrawal.bigBags;
      const withdrawnTotal = isHybrid ? reqQty : finalSmall + finalBig;
      const deliveryDate = validateDeliveryDate(input.date, grn.date);

      // Actual rent/charge calculation happens at Outward delivery using the single
      // effective-rate source of truth. Client rentCharge is reconciled, never trusted blindly.
      const { expectedRentCharge } = await computeExpectedDeliveryRent({
        grn: {
          id: grn.id, date: grn.date, rentType: grn.rentType, commodityId: grn.commodityId,
          smallBagPrice: grn.smallBagPrice, bigBagPrice: grn.bigBagPrice, bagPrice: grn.bagPrice,
        },
        withdrawal, deliveryDate, session,
        quantity: isHybrid ? reqQty : undefined,
        bagCategory: input.bagCategory,
        bagPrice: input.bagPrice,
        seasonalBagPrice: input.seasonalBagPrice,
        monthlyBagPrice: input.monthlyBagPrice,
      });

      if (input.rentCharge != null && input.rentCharge >= 0) {
        if (Math.abs(input.rentCharge - expectedRentCharge) > 0.01) {
          throw new Error(
            `rentCharge mismatch: expected ₹${expectedRentCharge.toLocaleString('en-IN')}, received ₹${input.rentCharge.toLocaleString('en-IN')}`,
          );
        }
      }
      // Internal first-season Hamali share joins the delivery rent charge (R1/R2).
      // Nothing is stored on the challan or GRN; the share is rent math only.
      const hamaliShare = await resolveFirstSeasonOutwardShare({ facilityId, grn, withdrawnTotal, session });
      const deliveryRentCharge = Number((expectedRentCharge + hamaliShare).toFixed(2));
      const rentBalance = await assertRentAllowedForOutward(
        facilityId,
        { id: grn.id, grnNumber: grn.grnNumber, rentAmount: grn.rentAmount ?? 0 },
        session,
      );

      const challanNumber = await counterService.generateDeliveryChallanNumber(facilityId, deliveryDate, session);
      const deliveryId = `del-${randomUUID()}`;

      const marks = input.marks?.trim() || grn.marks || null;

      // Sequential Gate Pass generation and concurrency duplicate prevention
      let gpNumber: string | null = null;
      if (input.gpNumber?.trim()) {
        gpNumber = input.gpNumber.trim();
        const match = /^GP-(\d+)$/i.exec(gpNumber);
        if (match) {
          const seq = parseInt(match[1], 10);
          if (!isNaN(seq)) {
            await counterService.syncGatePassSequence(facilityId, deliveryDate, seq, session);
          }
        }
      } else {
        gpNumber = await counterService.generateGatePassNumber(facilityId, deliveryDate, session);
      }

      if (gpNumber) {
        const existingGp = await DeliveryChallanModel.findOne(
          { facilityId, gpNumber },
          { id: 1 },
          { session },
        ).lean().exec();
        if (existingGp) {
          throw new Error(`Gate Pass number '${gpNumber}' already exists in this facility`);
        }
      }

      const challanDocs = await DeliveryChallanModel.create(
        [
          {
            id: deliveryId, facilityId, challanNumber, date: deliveryDate,
            grnId: grn.id, grnNumber: grn.grnNumber, customerId: grn.customerId, customerName: grn.customerName,
            commodityId: grn.commodityId, commodityName: grn.commodityName, chamber: grn.chamber,
            bagType: grn.bagType ?? 'S/B', bagCategory: input.bagCategory || null, bagPrice: input.bagPrice ?? null,
            seasonalBagPrice: input.seasonalBagPrice ?? null, monthlyBagPrice: input.monthlyBagPrice ?? null,
            smallBags: finalSmall, bigBags: finalBig, marks, gpNumber,
            vehicleNumber: input.vehicleNumber?.trim().toUpperCase() || null, driverName: input.driverName?.trim() || null,
            weight: input.weight ?? null, remarks: input.remarks?.trim() || null,
            rentCharge: deliveryRentCharge, status: 'ISSUED', issuedBy: userId,
          },
        ],
        { session, ordered: true },
      );
      createdChallanDoc = challanDocs[0];

      const txSmall = finalSmall;
      const txBig = finalBig;

      await InventoryTransactionModel.create(
        [
          {
            id: `tx-${randomUUID()}`,
            facilityId,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            chamber: grn.chamber,
            commodityId: grn.commodityId,
            bagType: grn.bagType ?? 'S/B',
            transactionType: 'OUTWARD_DELIVERY' as const,
            smallQuantity: txSmall,
            bigQuantity: txBig,
            referenceType: 'DELIVERY' as const,
            referenceId: deliveryId,
            notes: input.remarks?.trim() || null,
            createdBy: userId,
            createdAt: deliveryDate,
          },
        ],
        { session, ordered: true },
      );

      const { paidAmount } = await recordDeliveryInlinePayment({
        facilityId,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        deliveryDate,
        paymentAmount: input.paymentAmount,
        paymentMode: input.paymentMode,
        paymentReference: input.paymentReference,
        userId,
        session,
      });

      const closingTotal = available.total - withdrawnTotal;
      const effectiveObligation =
        grn.rentType === 'Seasonal' ? rentBalance.rentAmount : rentBalance.rentAmount + deliveryRentCharge;
      const totalPaidAfterDelivery = rentBalance.totalPaid + paidAmount;
      const effectiveRemaining = Math.max(0, Number((effectiveObligation - totalPaidAfterDelivery).toFixed(2)));

      // Closure invariant: A GRN is CLOSED only when both remainingBags === 0 AND remainingBalance === 0.
      // If bags reach 0 but rent balance remains, the GRN remains OPEN so outstanding dues are tracked.
      if (closingTotal === 0 && effectiveRemaining === 0) {
        await GrnModel.updateOne({ id: grn.id }, { $set: { status: 'CLOSED' } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  const delivery = toChallanEntity(createdChallanDoc!);
  const summary = await getDeliverySummary(facilityId, input.grnId);

  await auditService.log({
    eventType: 'DELIVERY_ISSUED', severity: 'INFO', userId, facilityId, resource: 'delivery', resourceId: delivery.id,
    details: {
      challanNumber: delivery.challanNumber, smallBags: delivery.smallBags, bigBags: delivery.bigBags,
      totalBags: delivery.totalBags, grnId: delivery.grnId, customerId: delivery.customerId,
    },
  });

  return { delivery, summary };
}
