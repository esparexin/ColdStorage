import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  calculateRentAmount,
  resolveOutwardRates,
  type BagComposition,
  type CreateDeliveryInput,
  type DeliveryChallan,
  type DeliverySummary,
} from '@cold-storage/contracts';
import { ConcurrencyConflictError } from '../../inventory/inventory.service.js';
import { counterService } from '../../common/counter.service.js';
import {
  DeliveryChallanModel,
  type DeliveryChallanDoc,
} from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { auditService } from '../../audit/audit.service.js';
import { assertRentAllowedForOutward } from '../../common/rent-gate.service.js';
import { isTransientError, toChallanEntity } from '../delivery.mappers.js';
import { getDeliverySummary } from '../queries/delivery.queries.js';
import {
  validateDeliveryDate,
  validateStockAndBalances,
} from './delivery-validation.helper.js';

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

      const resolvedSmall =
        (input.smallBags ?? 0) > 0 || (input.bigBags ?? 0) > 0
          ? (input.smallBags ?? 0)
          : grn.bagType === 'B'
            ? 0
            : (input.quantity ?? 0);
      const resolvedBig =
        (input.smallBags ?? 0) > 0 || (input.bigBags ?? 0) > 0
          ? (input.bigBags ?? 0)
          : grn.bagType === 'B'
            ? (input.quantity ?? 0)
            : 0;

      const withdrawal: BagComposition = {
        smallBags: resolvedSmall,
        bigBags: resolvedBig,
      };
      const withdrawnTotal = resolvedSmall + resolvedBig;

      const available = await validateStockAndBalances(facilityId, grn, withdrawal, session);

      // Actual rent/charge calculation happens at Outward delivery using the single
      // effective-rate source of truth. Client rentCharge is reconciled, never trusted blindly.
      const effectiveRates = resolveOutwardRates(grn.rentType, {
        smallBagPrice: grn.smallBagPrice,
        bigBagPrice: grn.bigBagPrice,
        bagPrice: grn.bagPrice,
      });
      const expectedRentCharge = calculateRentAmount({
        rentType: grn.rentType,
        bags: withdrawnTotal,
        bagType: 'S+B',
        smallBags: resolvedSmall,
        bigBags: resolvedBig,
        smallBagPrice: effectiveRates.small,
        bigBagPrice: effectiveRates.big,
        rentMonths: grn.rentMonths ?? 1,
      });
      if (input.rentCharge != null && input.rentCharge >= 0) {
        if (Math.abs(input.rentCharge - expectedRentCharge) > 0.01) {
          throw new Error(
            `rentCharge mismatch: expected ₹${expectedRentCharge.toLocaleString('en-IN')} for ${resolvedSmall} Small × ₹${effectiveRates.small} + ${resolvedBig} Big × ₹${effectiveRates.big} over ${grn.rentType === 'Seasonal' ? 'season total' : `${grn.rentMonths ?? 1} mo`}, received ₹${input.rentCharge.toLocaleString('en-IN')}`,
          );
        }
      }
      const deliveryRentCharge = expectedRentCharge;

      const rentBalance = await assertRentAllowedForOutward(
        facilityId,
        { id: grn.id, grnNumber: grn.grnNumber, rentAmount: grn.rentAmount ?? 0 },
        session,
      );

      const deliveryDate = validateDeliveryDate(input.date);

      const challanNumber = await counterService.generateDeliveryChallanNumber(facilityId, deliveryDate, session);
      const deliveryId = `del-${randomUUID()}`;

      const marks = input.marks?.trim() || grn.marks || null;
      const gpNumber = input.gpNumber?.trim() || grn.gpNumber || null;

      const challanDocs = await DeliveryChallanModel.create(
        [
          {
            id: deliveryId,
            facilityId,
            challanNumber,
            date: deliveryDate,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            customerId: grn.customerId,
            customerName: grn.customerName,
            commodityId: grn.commodityId,
            commodityName: grn.commodityName,
            chamber: grn.chamber,
            bagType: grn.bagType ?? 'S/B',
            smallBags: resolvedSmall,
            bigBags: resolvedBig,
            marks,
            gpNumber,
            vehicleNumber: input.vehicleNumber?.trim().toUpperCase() || null,
            driverName: input.driverName?.trim() || null,
            weight: input.weight ?? null,
            remarks: input.remarks?.trim() || null,
            rentCharge: deliveryRentCharge,
            status: 'ISSUED',
            issuedBy: userId,
          },
        ],
        { session, ordered: true },
      );

      createdChallanDoc = challanDocs[0];

      const txSmall = available.bigBags === 0 ? withdrawnTotal : available.smallBags === 0 ? 0 : resolvedSmall;
      const txBig = available.smallBags === 0 ? withdrawnTotal : available.bigBags === 0 ? 0 : resolvedBig;

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

      const closingTotal = available.total - withdrawnTotal;

      // Closure invariant: A GRN is CLOSED only when both remainingBags === 0 AND remainingBalance === 0.
      // If bags reach 0 but rent balance remains, the GRN remains OPEN so outstanding dues are tracked.
      if (closingTotal === 0 && rentBalance.remainingBalance === 0) {
        await GrnModel.updateOne({ id: grn.id }, { $set: { status: 'CLOSED' } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  const delivery = toChallanEntity(createdChallanDoc!);
  const summary = await getDeliverySummary(facilityId, input.grnId);

  await auditService.log({
    eventType: 'DELIVERY_ISSUED',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'delivery',
    resourceId: delivery.id,
    details: {
      challanNumber: delivery.challanNumber,
      smallBags: delivery.smallBags,
      bigBags: delivery.bigBags,
      totalBags: delivery.totalBags,
      grnId: delivery.grnId,
      customerId: delivery.customerId,
    },
  });

  return { delivery, summary };
}
