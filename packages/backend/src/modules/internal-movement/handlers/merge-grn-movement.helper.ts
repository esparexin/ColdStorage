import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { isHybridBagCategory, type MergeGrnInput, type BagType } from '@cold-storage/contracts';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import type { RentBalance } from '../../common/rent-balance.js';

export interface CreateMergePutawayTransactionParams {
  facilityId: string;
  movementId: string;
  moveDate: Date;
  targetGrn: { id: string; grnNumber: string; chamber: string; commodityId: string };
  resultingBagType: BagType;
  sourceGrns: Array<{ grnNumber: string }>;
  totalMovedSmall: number;
  totalMovedBig: number;
  remarks: string;
  userId: string;
  session: mongoose.ClientSession;
}

export async function createMergePutawayTransaction(
  params: CreateMergePutawayTransactionParams,
): Promise<void> {
  const {
    facilityId,
    movementId,
    moveDate,
    targetGrn,
    resultingBagType,
    sourceGrns,
    totalMovedSmall,
    totalMovedBig,
    remarks,
    userId,
    session,
  } = params;

  await InventoryTransactionModel.create(
    [
      {
        id: `tx-${randomUUID()}`,
        facilityId,
        grnId: targetGrn.id,
        grnNumber: targetGrn.grnNumber,
        chamber: targetGrn.chamber,
        commodityId: targetGrn.commodityId,
        bagType: resultingBagType,
        transactionType: 'INWARD_PUTAWAY',
        smallQuantity: totalMovedSmall,
        bigQuantity: totalMovedBig,
        referenceType: 'PUT_AWAY',
        referenceId: movementId,
        notes: `Merged from GRNs ${sourceGrns.map((s) => s.grnNumber).join(', ')}: ${remarks.trim()}`,
        createdBy: userId,
        createdAt: moveDate,
      },
    ],
    { session, ordered: true },
  );
}

export interface CreateMergeMovementRecordParams {
  facilityId: string;
  movementId: string;
  moveDate: Date;
  targetGrn: { id: string; grnNumber: string };
  sourceGrns: Array<{ id: string; grnNumber: string }>;
  totalMovedBags: number;
  totalMovedSmall: number;
  totalMovedBig: number;
  newRentAmount: number;
  targetPaid: number;
  targetRentBal: RentBalance;
  hamaliBags?: number;
  hamaliRate?: number;
  hamaliCharge?: number;
  repackVariance?: number;
  repackSourceBags?: number;
  input: MergeGrnInput;
  userId: string;
  session: mongoose.ClientSession;
  idempotencyKey?: string | null;
}

export async function createMergeMovementRecord(
  params: CreateMergeMovementRecordParams,
): Promise<unknown> {
  const {
    facilityId,
    movementId,
    moveDate,
    targetGrn,
    sourceGrns,
    totalMovedBags,
    totalMovedSmall,
    totalMovedBig,
    newRentAmount,
    targetPaid,
    targetRentBal,
    hamaliBags = 0,
    hamaliRate = 0,
    hamaliCharge = 0,
    repackVariance = 0,
    repackSourceBags,
    input,
    userId,
    session,
    idempotencyKey = null,
  } = params;

  const movementDocs = await InternalMovementModel.create(
    [
      {
        id: movementId,
        facilityId,
        movementType: 'MERGE',
        movementDate: moveDate,
        targetGrnId: targetGrn.id,
        targetGrnNumber: targetGrn.grnNumber,
        sourceGrnIds: sourceGrns.map((s) => s.id),
        sourceGrnNumbers: sourceGrns.map((s) => s.grnNumber),
        totalBagsMoved: totalMovedBags,
        smallBagsMoved: totalMovedSmall,
        bigBagsMoved: totalMovedBig,
        sourceBagType: input.sourceBagType ?? (input.sourceBagCategory && isHybridBagCategory(input.sourceBagCategory) ? 'Hybrid' : null),
        sourceBagCategory: input.sourceBagCategory ?? null,
        sourceQuantity: input.sourceQuantity ?? null,
        sourceBagPrice: input.sourceBagPrice ?? null,
        sourceSeasonalBagPrice: input.sourceSeasonalBagPrice ?? null,
        sourceMonthlyBagPrice: input.sourceMonthlyBagPrice ?? null,
        repackVariance,
        repackSourceBags,
        ...(hamaliCharge > 0
          ? {
              hamaliBags,
              hamaliRate,
              hamaliCharge,
            }
          : {}),
        referenceWeight: input.referenceWeight ?? null,
        idempotencyKey,
        financialSnapshot: {
          rentAmount: newRentAmount,
          totalPaid: targetPaid,
          remainingBalance: targetRentBal.remainingBalance,
          paymentStatus: targetRentBal.paymentStatus,
          rentState: targetRentBal.rentState,
          ...(hamaliCharge > 0 ? { hamaliAmount: hamaliCharge } : {}),
        },
        remarks: input.remarks.trim(),
        performedBy: userId,
        createdAt: new Date(),
      },
    ],
    { session, ordered: true },
  );

  return movementDocs[0].toObject();
}
