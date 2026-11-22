import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  calculateHamaliAmount,
  type Grn,
  type InternalMovementRecord,
  type RepackGrnInput,
  type RepackGrnResult,
} from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { counterService } from '../../common/counter.service.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { resolveEffectiveHamaliRate } from '../../common/hamali-resolution.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';
import { snapshotRepackRentObligation, updateRepackProspectiveRent } from './repack-grn.rent.js';

export async function executeRepackGrn(
  facilityId: string,
  input: RepackGrnInput,
  userId: string,
): Promise<RepackGrnResult> {
  const session = await mongoose.startSession();
  let resultGrn!: Grn;
  let resultMovement!: InternalMovementRecord;
  let repackVariance = 0;
  let sortingLaborCharge = 0;
  let bardanaCharge = 0;
  let totalServiceCharge = 0;
  let sortingInvoiceNumber = '';
  let previousStock = { total: 0, smallBags: 0, bigBags: 0 };

  try {
    await withMongoRetry(() =>
      session.withTransaction(async () => {
        if (input.idempotencyKey) {
          const existing = await InternalMovementModel.findOne({ facilityId, idempotencyKey: input.idempotencyKey }, null, { session }).lean().exec();
          if (existing) {
            const exGrn = await GrnModel.findOne({ id: existing.targetGrnId, facilityId }, null, { session }).lean().exec();
            if (exGrn) {
              resultGrn = toGrnEntity(exGrn);
              resultMovement = { ...existing, movementDate: new Date(existing.movementDate), createdAt: new Date(existing.createdAt) } as InternalMovementRecord;
              repackVariance = existing.repackVariance ?? 0;
              sortingLaborCharge = existing.sortingLaborCharge ?? existing.hamaliCharge ?? 0;
              totalServiceCharge = existing.totalServiceCharge ?? sortingLaborCharge;
              sortingInvoiceNumber = existing.sortingInvoiceNumber ?? '';
              return;
            }
          }
        }

        const grn = await GrnModel.findOne({ id: input.grnId, facilityId }, null, { session });
        if (!grn) throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
        if (grn.status === 'CLOSED') throw new Error(`Cannot repack CLOSED GRN '${grn.grnNumber}'`);
        if (grn.loanStatus === 'TAKEN') throw new Error(`Cannot repack: Active loan hold against GRN '${grn.grnNumber}'`);
        if (!grn.isSorted) throw new Error('PRECONDITION_FAILED: Sorting confirmation and rent bill generation must be completed before repacking');

        const bal = await readLedgerBalance(facilityId, grn.id, session);
        if (bal.total <= 0) throw new Error(`Cannot repack GRN '${grn.grnNumber}': No stock remaining`);
        previousStock = { total: bal.total, smallBags: bal.smallBags, bigBags: bal.bigBags };

        const isHybrid = input.resultingBagType === 'Hybrid';
        const actualRepackedBags = isHybrid ? (input.repackedQuantity ?? 0) : (input.repackedSmallBags ?? 0) + (input.repackedBigBags ?? 0);
        if (actualRepackedBags <= 0) throw new Error('Repacked bag count must be greater than zero');

        repackVariance = actualRepackedBags - bal.total;

        // Service Invoicing: Labor & Bardana calculation
        const commodity = await CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec();
        const isApplicable = commodity?.isHamaliApplicable ?? ((commodity?.hamaliRate ?? 0) > 0);
        const sortingLaborRate = input.sortingLaborRatePerBag ?? (isApplicable ? (commodity?.hamaliRate ?? 0) : 0);
        sortingLaborCharge = input.totalSortingLaborCharge ?? (sortingLaborRate > 0 ? calculateHamaliAmount(actualRepackedBags, sortingLaborRate) : 0);

        const newBagsSupplied = input.newBagsSupplied ?? 0;
        const newBagRate = input.newBagRate ?? 0;
        bardanaCharge = input.totalBardanaCharge ?? (newBagsSupplied * newBagRate);
        totalServiceCharge = input.totalServiceCharge ?? (sortingLaborCharge + bardanaCharge);

        const movementDate = new Date();
        sortingInvoiceNumber = await counterService.generateSortingInvoiceNumber(facilityId, movementDate, session);

        // Weight Synchronization across established locations
        if (typeof input.referenceWeight === 'number' && input.referenceWeight > 0) {
          grn.totalBagsWeight = input.referenceWeight;
        } else if (grn.smallBagWeight != null && grn.bigBagWeight != null && !isHybrid) {
          grn.totalBagsWeight = (input.repackedSmallBags ?? 0) * grn.smallBagWeight + (input.repackedBigBags ?? 0) * grn.bigBagWeight;
        }

        const outSmall = bal.smallBags, outBig = bal.bigBags;
        const inSmall = isHybrid ? actualRepackedBags : (input.repackedSmallBags ?? 0);
        const inBig = isHybrid ? 0 : (input.repackedBigBags ?? 0);
        const movementId = `mov-${randomUUID()}`;
        const destinationChamber = input.destinationChamber?.trim() || grn.chamber;
        if (!destinationChamber) throw new Error('Destination chamber is required for repacking putaway');

        // Ledger balance adjustment: outward old composition, inward repacked composition
        await InventoryTransactionModel.create([
          {
            id: `tx-out-${randomUUID()}`, facilityId, grnId: grn.id, grnNumber: grn.grnNumber,
            chamber: grn.chamber, commodityId: grn.commodityId, bagType: grn.bagType,
            transactionType: 'OUTWARD_DELIVERY', smallQuantity: outSmall, bigQuantity: outBig,
            referenceType: 'DELIVERY', referenceId: movementId,
            notes: `Stock adjustment for repacking (Lot ${grn.grnNumber})`, createdBy: userId, createdAt: movementDate,
          },
          {
            id: `tx-in-${randomUUID()}`, facilityId, grnId: grn.id, grnNumber: grn.grnNumber,
            chamber: destinationChamber, commodityId: grn.commodityId, bagType: input.resultingBagType,
            transactionType: 'INWARD_PUTAWAY', smallQuantity: inSmall, bigQuantity: inBig,
            referenceType: 'PUT_AWAY', referenceId: movementId,
            notes: `Repacked stock putaway (Lot ${grn.grnNumber})`, createdBy: userId, createdAt: movementDate,
          },
        ], { session, ordered: true });

        // Update GRN document
        grn.chamber = destinationChamber;
        grn.bagType = input.resultingBagType;
        if (grn.hamaliAmount == null) {
          const effectiveIntakeRate = resolveEffectiveHamaliRate(grn.hamaliRate, commodity);
          grn.hamaliRate = effectiveIntakeRate;
          grn.hamaliAmount = calculateHamaliAmount(grn.bags, effectiveIntakeRate);
        }
        grn.bags = actualRepackedBags;
        grn.smallBags = inSmall;
        grn.bigBags = inBig;
        grn.isCompositionVerified = true;
        grn.isSorted = false;
        grn.updatedAt = movementDate;

        // Prospective subscription recalculation
        updateRepackProspectiveRent({ grn, previousTotalBags: bal.total, actualRepackedBags, inSmall, inBig, movementDate });
        await grn.save({ session });

        // Authoritative rent obligation & balance snapshot (SSOT)
        const rentBal = await snapshotRepackRentObligation(facilityId, grn, commodity, session);

        // Authoritative audit remarks with explicit composition and service invoice reference
        const dateStr = movementDate.toISOString().slice(0, 10);
        const compStr = isHybrid ? `${actualRepackedBags} bags (Hybrid)` : `${actualRepackedBags} bags (S: ${inSmall} • B: ${inBig}, BagType: ${input.resultingBagType})`;
        const variancePart = repackVariance !== 0 ? ` (Variance: ${repackVariance > 0 ? `+${repackVariance}` : repackVariance} bags${input.repackVarianceReason ? ` - ${input.repackVarianceReason}` : ''})` : '';
        const authRemarks = `[SORTED & REPACKED on ${dateStr}: ${bal.total} ➔ ${compStr}${variancePart} | Inv #${sortingInvoiceNumber} | Service: ₹${totalServiceCharge} (Labor: ₹${sortingLaborCharge}, Bardana: ₹${bardanaCharge}) | ${input.remarks}]`;
        grn.remarks = grn.remarks ? `${grn.remarks} | ${authRemarks}` : authRemarks;
        await grn.save({ session });

        // Record in InternalMovementModel for history and audit
        const movementDoc = await InternalMovementModel.create([{
          id: movementId, facilityId, movementType: 'REPACK', movementDate,
          targetGrnId: grn.id, targetGrnNumber: grn.grnNumber,
          sourceGrnIds: [grn.id], sourceGrnNumbers: [grn.grnNumber], totalBagsMoved: actualRepackedBags,
          smallBagsMoved: isHybrid ? 0 : (input.repackedSmallBags ?? 0),
          bigBagsMoved: isHybrid ? 0 : (input.repackedBigBags ?? 0),
          destinationChamber, resultingBagType: input.resultingBagType, sourceBagType: previousStock.total > 0 ? grn.bagType : undefined,
          hamaliBags: actualRepackedBags, hamaliRate: sortingLaborRate, hamaliCharge: sortingLaborCharge,
          repackVariance, repackSourceBags: bal.total, referenceWeight: grn.totalBagsWeight,
          sortingInvoiceNumber, sortingLaborCharge, bardanaCharge, newBagsSupplied, newBagRate, totalServiceCharge,
          financialSnapshot: {
            rentAmount: rentBal.rentAmount, totalPaid: rentBal.totalPaid,
            remainingBalance: rentBal.remainingBalance, paymentStatus: rentBal.paymentStatus,
            rentState: rentBal.rentState, hamaliAmount: sortingLaborCharge,
          },
          remarks: authRemarks,
          idempotencyKey: input.idempotencyKey ?? null, performedBy: userId,
        }], { session, ordered: true });

        resultGrn = toGrnEntity(grn.toObject());
        resultMovement = {
          ...movementDoc[0].toObject(), id: movementDoc[0].id,
          movementDate: new Date(movementDoc[0].movementDate), createdAt: new Date(movementDoc[0].createdAt),
        } as InternalMovementRecord;
      }),
    );
  } finally {
    await session.endSession();
  }

  await auditService.log({
    eventType: 'INTERNAL_MOVEMENT_REPACK', severity: 'INFO', userId, facilityId,
    resource: 'grn', resourceId: resultGrn.id,
    details: {
      grnNumber: resultGrn.grnNumber, transactionType: 'REPACK', previousStock,
      confirmedBagComposition: {
        resultingBagType: input.resultingBagType,
        repackedSmallBags: input.repackedSmallBags ?? null,
        repackedBigBags: input.repackedBigBags ?? null,
        repackedQuantity: input.repackedQuantity ?? null,
      },
      newStockComposition: {
        totalBags: resultGrn.bags, smallBags: resultMovement.smallBagsMoved,
        bigBags: resultMovement.bigBagsMoved, bagType: input.resultingBagType,
      },
      billReferences: { sortingInvoiceNumber, totalServiceCharge, sortingLaborCharge, bardanaCharge, movementId: resultMovement.id },
      destinationChamber: resultGrn.chamber, resultingBagType: input.resultingBagType,
      repackedBags: resultGrn.bags, repackVariance, repackVarianceReason: input.repackVarianceReason,
      totalBagsWeight: resultGrn.totalBagsWeight,
    },
  });

  return {
    grn: resultGrn,
    movement: resultMovement,
    repackVariance,
    hamaliCharge: sortingLaborCharge,
    sortingInvoiceNumber,
    totalServiceCharge,
  };
}
