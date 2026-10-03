import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { CreateDeliveryInput, DeliveryChallan, DeliverySummary } from '@cold-storage/contracts';
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
      )
        .lean()
        .exec();

      if (!grn) {
        throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
      }
      if (grn.status === 'CLOSED') {
        throw new Error(`Cannot create delivery: GRN '${grn.grnNumber}' is CLOSED`);
      }

      await assertRentAllowedForOutward(
        facilityId,
        { id: grn.id, grnNumber: grn.grnNumber, rentAmount: grn.rentAmount ?? 0 },
        session,
      );

      const { remainingDeliveryBalance, physicallyStored } = await validateStockAndBalances(
        facilityId,
        grn,
        input.bags,
        session,
      );

      const deliveryDate = validateDeliveryDate(input.date);

      const challanNumber = await counterService.generateDeliveryChallanNumber(
        facilityId,
        deliveryDate,
        session,
      );
      const deliveryId = `del-${randomUUID()}`;

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
            bags: input.bags,
            totalBags: input.bags,
            vehicleNumber: input.vehicleNumber?.trim().toUpperCase() || null,
            driverName: input.driverName?.trim() || null,
            weight: input.weight ?? null,
            remarks: input.remarks?.trim() || null,
            status: 'ISSUED',
            issuedBy: userId,
          },
        ],
        { session, ordered: true },
      );

      createdChallanDoc = challanDocs[0];

      await InventoryTransactionModel.create(
        [
          {
            id: `tx-${randomUUID()}`,
            facilityId,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            chamber: grn.chamber,
            customerId: grn.customerId,
            commodityId: grn.commodityId,
            bagType: grn.bagType,
            transactionType: 'OUTWARD_DELIVERY' as const,
            quantity: input.bags,
            referenceType: 'DELIVERY' as const,
            referenceId: deliveryId,
            notes: input.remarks?.trim() || null,
            createdBy: userId,
            createdAt: deliveryDate,
          },
        ],
        { session, ordered: true },
      );

      const newRemainingDeliveryBalance = remainingDeliveryBalance - input.bags;
      const newPhysicallyStored = physicallyStored - input.bags;

      if (newRemainingDeliveryBalance === 0 && newPhysicallyStored === 0) {
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
      totalBags: delivery.totalBags,
      grnId: delivery.grnId,
      customerId: delivery.customerId,
    },
  });

  return { delivery, summary };
}
