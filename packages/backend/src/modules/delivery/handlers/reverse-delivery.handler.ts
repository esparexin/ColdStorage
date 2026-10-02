import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type {
  DeliveryChallan,
  DeliveryReversal,
  DeliverySummary,
  ReverseDeliveryInput,
} from '@cold-storage/contracts';
import { ConcurrencyConflictError } from '../../inventory/inventory.service.js';
import {
  DeliveryChallanModel,
  type DeliveryChallanDoc,
} from '../../../database/models/delivery-challan.model.js';
import {
  DeliveryReversalModel,
  type DeliveryReversalDoc,
} from '../../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { PositionModel } from '../../../database/models/position.model.js';
import { auditService } from '../../audit/audit.service.js';
import { isTransientError, toChallanEntity, toReversalEntity } from '../delivery.mappers.js';
import { getDeliverySummary } from '../queries/delivery.queries.js';
import { validateReversalPositionsAndCapacity } from './delivery-validation.helper.js';

export async function reverseDeliveryWithRetry(
  facilityId: string,
  deliveryId: string,
  input: ReverseDeliveryInput,
  userId: string,
): Promise<{ reversal: DeliveryReversal; challan: DeliveryChallan; summary: DeliverySummary }> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      return await executeReversalTransaction(facilityId, deliveryId, input, userId);
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

async function executeReversalTransaction(
  facilityId: string,
  deliveryId: string,
  input: ReverseDeliveryInput,
  userId: string,
): Promise<{ reversal: DeliveryReversal; challan: DeliveryChallan; summary: DeliverySummary }> {
  const session = await mongoose.startSession();
  let createdReversalDoc: DeliveryReversalDoc;
  let updatedChallanDoc: DeliveryChallanDoc;
  let grnId = '';

  try {
    await session.withTransaction(async () => {
      const existingChallan = await DeliveryChallanModel.findOne({ id: deliveryId, facilityId })
        .session(session)
        .lean()
        .exec();

      if (!existingChallan) {
        throw new Error(`Delivery challan '${deliveryId}' not found in facility '${facilityId}'`);
      }
      if (existingChallan.status === 'REVERSED') {
        throw new Error(`Delivery challan '${existingChallan.challanNumber}' is already REVERSED`);
      }

      grnId = existingChallan.grnId;

      const grn = await GrnModel.findOneAndUpdate(
        { id: grnId, facilityId },
        { $set: { updatedAt: new Date() } },
        { session, new: true },
      )
        .lean()
        .exec();

      if (!grn) {
        throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
      }

      const lockedPositions = await validateReversalPositionsAndCapacity(
        facilityId,
        existingChallan.items,
        session,
      );

      const lockedChallan = await DeliveryChallanModel.findOneAndUpdate(
        { id: deliveryId, facilityId, status: 'ISSUED' },
        { $set: { status: 'REVERSED', updatedAt: new Date() } },
        { session, new: true },
      ).exec();

      if (!lockedChallan) {
        throw new Error(
          `Delivery challan '${deliveryId}' cannot be reversed (must be in ISSUED status)`,
        );
      }
      updatedChallanDoc = lockedChallan;

      const reversalId = `rev-${randomUUID()}`;
      const reversedAt = new Date();

      const reversalDocs = await DeliveryReversalModel.create(
        [
          {
            id: reversalId,
            facilityId,
            deliveryId: existingChallan.id,
            challanNumber: existingChallan.challanNumber,
            grnId: grn.id,
            reason: input.reason.trim(),
            reversedBy: userId,
            reversedAt,
          },
        ],
        { session, ordered: true },
      );

      createdReversalDoc = reversalDocs[0];

      const positionDocs = await PositionModel.find(
        { id: { $in: existingChallan.items.map((i) => i.positionId) } },
        null,
        { session },
      )
        .lean()
        .exec();
      const positionMap = new Map(positionDocs.map((p) => [p.id, p]));

      const reversalLedgerRows = existingChallan.items.map((item) => {
        const pos = positionMap.get(item.positionId)!;
        return {
          id: `tx-${randomUUID()}`,
          facilityId,
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          chamberId: grn.chamberId,
          rackId: pos.rackId,
          levelId: pos.levelId,
          positionId: pos.id,
          positionCode: lockedPositions.get(item.positionId)?.code || pos.code,
          customerId: grn.customerId,
          commodityId: grn.commodityId,
          bagType: grn.bagType,
          transactionType: 'DELIVERY_REVERSAL' as const,
          quantity: item.bags,
          referenceType: 'DELIVERY_REVERSAL' as const,
          referenceId: reversalId,
          notes: `Reversal of challan ${existingChallan.challanNumber}: ${input.reason.trim()}`,
          createdBy: userId,
          createdAt: reversedAt,
        };
      });

      await InventoryTransactionModel.create(reversalLedgerRows, { session, ordered: true });

      if (grn.status === 'CLOSED') {
        await GrnModel.updateOne({ id: grn.id }, { $set: { status: 'OPEN' } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  const reversal = toReversalEntity(createdReversalDoc!);
  const challan = toChallanEntity(updatedChallanDoc!);
  const summary = await getDeliverySummary(facilityId, grnId);

  await auditService.log({
    eventType: 'DELIVERY_REVERSED',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'delivery',
    resourceId: reversal.id,
    details: {
      deliveryId: challan.id,
      challanNumber: challan.challanNumber,
      reason: input.reason,
    },
  });

  return { reversal, challan, summary };
}
