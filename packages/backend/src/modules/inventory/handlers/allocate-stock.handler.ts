import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type {
  CreatePutAwayInput,
  GrnInventorySummary,
  PutAwayAllocation,
} from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import {
  PutAwayAllocationModel,
  type PutAwayAllocationDoc,
} from '../../../database/models/put-away.model.js';
import { auditService } from '../../audit/audit.service.js';
import { assertRentAllowedForOutward } from '../../common/rent-gate.service.js';
import { ConcurrencyConflictError, isTransientError, toPutAwayEntity } from '../inventory.mappers.js';
import { getAllocatedBags, getGrnInventorySummary } from '../queries/stock-summary.queries.js';

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

/**
 * Confirms a GRN's remaining bags are on hand in the chamber recorded on that GRN.
 *
 * A GRN is one commodity in one chamber, so allocation is whole-lot: the outstanding bag count
 * is what gets allocated, there is no per-position breakdown and no capacity to check against.
 * The GRN row is bumped inside the transaction to serialise concurrent put-aways on the same
 * GRN, which is what previously came from locking storage positions.
 */
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

      const existingAllocation = await PutAwayAllocationModel.findOne(
        { facilityId, grnId: grn.id },
        null,
        { session },
      )
        .lean()
        .exec();
      if (existingAllocation) {
        throw new Error(`GRN '${grn.grnNumber}' is already fully allocated`);
      }
      const remainingBags = grn.bags;

      const putAwayId = `pa-${randomUUID()}`;
      const allocatedAt = new Date();
      const notes = input.notes?.trim() || null;

      const putAwayDocs = await PutAwayAllocationModel.create(
        [
          {
            id: putAwayId,
            facilityId,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            chamber: grn.chamber,
            bags: remainingBags,
            notes,
            allocatedBy: userId,
            allocatedAt,
          },
        ],
        { session, ordered: true },
      );

      createdPutAwayDoc = putAwayDocs[0];

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
            transactionType: 'INWARD_PUTAWAY' as const,
            quantity: remainingBags,
            referenceType: 'PUT_AWAY' as const,
            referenceId: putAwayId,
            notes,
            createdBy: userId,
            createdAt: allocatedAt,
          },
        ],
        { session, ordered: true },
      );
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
      chamber: putAway.chamber,
      bags: putAway.bags,
    },
  });

  return { putAway, summary };
}