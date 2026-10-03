import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type {
  CreatePutAwayInput,
  GrnInventorySummary,
  PutAwayAllocation,
  PutAwayItem,
} from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { PositionModel } from '../../../database/models/position.model.js';
import {
  PutAwayAllocationModel,
  type PutAwayAllocationDoc,
} from '../../../database/models/put-away.model.js';
import { auditService } from '../../audit/audit.service.js';
import { assertRentAllowedForOutward } from '../../common/rent-gate.service.js';
import {
  ConcurrencyConflictError,
  isTransientError,
  toPutAwayEntity,
} from '../inventory.mappers.js';
import { getGrnInventorySummary } from '../queries/stock-summary.queries.js';

import {
  validateAndLockPutAwayPositions,
  validatePutAwayCapacity,
} from './allocate-validation.helper.js';

export async function createPutAwayWithRetry(
  facilityId: string,
  grnId: string,
  input: CreatePutAwayInput,
  userId: string,
): Promise<{ putAway: PutAwayAllocation; summary: GrnInventorySummary }> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      return await executePutAwayTransaction(facilityId, grnId, input, userId);
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

async function executePutAwayTransaction(
  facilityId: string,
  grnId: string,
  input: CreatePutAwayInput,
  userId: string,
): Promise<{ putAway: PutAwayAllocation; summary: GrnInventorySummary }> {
  const session = await mongoose.startSession();
  let createdPutAwayDoc: PutAwayAllocationDoc;

  try {
    await session.withTransaction(async () => {
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
      if (grn.status !== 'OPEN') {
        throw new Error(`GRN '${grn.grnNumber}' is not OPEN (status: ${grn.status})`);
      }

      await assertRentAllowedForOutward(
        facilityId,
        { id: grn.id, grnNumber: grn.grnNumber, rentAmount: grn.rentAmount ?? 0 },
        session,
      );

      const lockedPositions = await validateAndLockPutAwayPositions(
        facilityId,
        grn.chamberId,
        input.items,
        session,
      );

      const totalRequestedBags = await validatePutAwayCapacity(
        facilityId,
        grn.id,
        grn.bags,
        input.items,
        lockedPositions,
        session,
      );

      const putAwayId = `pa-${randomUUID()}`;
      const allocatedAt = new Date();

      const putAwayItems: PutAwayItem[] = input.items.map((item) => ({
        positionId: item.positionId,
        positionCode: lockedPositions.get(item.positionId)!.code,
        bags: item.bags,
      }));

      const putAwayDocs = await PutAwayAllocationModel.create(
        [
          {
            id: putAwayId,
            facilityId,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            chamberId: grn.chamberId,
            items: putAwayItems,
            totalBags: totalRequestedBags,
            notes: input.notes?.trim() || null,
            allocatedBy: userId,
            allocatedAt,
          },
        ],
        { session, ordered: true },
      );

      createdPutAwayDoc = putAwayDocs[0];

      const positionDocs = await PositionModel.find(
        { id: { $in: input.items.map((i) => i.positionId) } },
        null,
        { session },
      )
        .lean()
        .exec();

      const positionMap = new Map(positionDocs.map((p) => [p.id, p]));

      const ledgerDocsToCreate = input.items.map((item) => {
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
          positionCode: pos.code,
          customerId: grn.customerId,
          commodityId: grn.commodityId,
          bagType: grn.bagType,
          transactionType: 'INWARD_PUTAWAY' as const,
          quantity: item.bags,
          referenceType: 'PUT_AWAY' as const,
          referenceId: putAwayId,
          notes: input.notes?.trim() || null,
          createdBy: userId,
          createdAt: allocatedAt,
        };
      });

      await InventoryTransactionModel.create(ledgerDocsToCreate, { session, ordered: true });
    });
  } finally {
    await session.endSession();
  }

  const putAway = toPutAwayEntity(createdPutAwayDoc!);
  const summary = await getGrnInventorySummary(facilityId, grnId);

  await auditService.log({
    eventType: 'INVENTORY_PUTAWAY',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'inventory',
    resourceId: putAway.id,
    details: {
      grnId,
      itemsCount: input.items.length,
      totalBags: input.items.reduce((acc, curr) => acc + curr.bags, 0),
    },
  });

  return { putAway, summary };
}
