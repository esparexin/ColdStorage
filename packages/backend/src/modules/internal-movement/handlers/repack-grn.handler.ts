import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  calculateHamaliAmount, calculateRentAmount, deriveBagPrice, resolveTotalRentObligation,
  seasonYearForInwardDate, type Grn, type InternalMovementRecord, type RepackGrnInput, type RepackGrnResult,
} from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { RentExtensionModel } from '../../../database/models/rent-extension.model.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { readLedgerBalance, readLedgerNetDelivered } from '../../inventory/ledger-balance.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { computeFirstSeasonHamali, resolveEffectiveHamaliRate } from '../../common/hamali-resolution.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';

export async function executeRepackGrn(
  facilityId: string,
  input: RepackGrnInput,
  userId: string,
): Promise<RepackGrnResult> {
  const session = await mongoose.startSession();
  let resultGrn!: Grn;
  let resultMovement!: InternalMovementRecord;
  let repackVariance = 0;
  let repackHamaliCharge = 0;

  try {
    await withMongoRetry(() =>
      session.withTransaction(async () => {
        if (input.idempotencyKey) {
          const existing = await InternalMovementModel.findOne(
            { facilityId, idempotencyKey: input.idempotencyKey }, null, { session },
          ).lean().exec();
          if (existing) {
            const exGrn = await GrnModel.findOne({ id: existing.targetGrnId, facilityId }, null, { session }).lean().exec();
            if (exGrn) {
              resultGrn = toGrnEntity(exGrn);
              resultMovement = { ...existing, movementDate: new Date(existing.movementDate), createdAt: new Date(existing.createdAt) } as InternalMovementRecord;
              repackVariance = existing.repackVariance ?? 0;
              repackHamaliCharge = existing.hamaliCharge ?? 0;
              return;
            }
          }
        }

        const grn = await GrnModel.findOne({ id: input.grnId, facilityId }, null, { session });
        if (!grn) {
          throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
        }
        if (grn.status === 'CLOSED') {
          throw new Error(`Cannot repack CLOSED GRN '${grn.grnNumber}'`);
        }
        if (grn.loanStatus === 'TAKEN') {
          throw new Error(`Cannot repack: Active loan hold against GRN '${grn.grnNumber}'`);
        }

        // Hard gate: Sorting confirmation & bill generation must be completed first
        if (!grn.isSorted) {
          throw new Error(
            'PRECONDITION_FAILED: Sorting confirmation and rent bill generation must be completed before repacking',
          );
        }

        const bal = await readLedgerBalance(facilityId, grn.id, session);
        if (bal.total <= 0) {
          throw new Error(`Cannot repack GRN '${grn.grnNumber}': No stock remaining`);
        }

        const isHybrid = input.resultingBagType === 'Hybrid';
        const actualRepackedBags = isHybrid
          ? (input.repackedQuantity ?? 0)
          : (input.repackedSmallBags ?? 0) + (input.repackedBigBags ?? 0);

        if (actualRepackedBags <= 0) {
          throw new Error('Repacked bag count must be greater than zero');
        }

        repackVariance = actualRepackedBags - bal.total;

        if (repackVariance !== 0 && !input.repackVarianceReason?.trim()) {
          throw new Error(
            'Repack variance reason is required when repacked count differs from original bags',
          );
        }

        // Calculate Hamali labor charge for the repacking activity
        const commodity = await CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec();
        const isApplicable = commodity?.isHamaliApplicable ?? ((commodity?.hamaliRate ?? 0) > 0);
        const hamaliRate = isApplicable ? (commodity?.hamaliRate ?? 0) : 0;
        repackHamaliCharge = hamaliRate > 0 ? calculateHamaliAmount(actualRepackedBags, hamaliRate) : 0;

        // Weight Synchronization across the established locations
        if (typeof input.referenceWeight === 'number' && input.referenceWeight > 0) {
          grn.totalBagsWeight = input.referenceWeight;
        } else if (grn.smallBagWeight != null && grn.bigBagWeight != null && !isHybrid) {
          grn.totalBagsWeight =
            (input.repackedSmallBags ?? 0) * grn.smallBagWeight +
            (input.repackedBigBags ?? 0) * grn.bigBagWeight;
        }

        const outSmall = bal.smallBags, outBig = bal.bigBags;
        const inSmall = isHybrid ? actualRepackedBags : (input.repackedSmallBags ?? 0);
        const inBig = isHybrid ? 0 : (input.repackedBigBags ?? 0);

        const movementId = `mov-${randomUUID()}`;
        const movementDate = new Date();
        const destinationChamber = input.destinationChamber?.trim() || grn.chamber;

        // Ledger balance adjustment: outward old composition, inward repacked composition
        await InventoryTransactionModel.create(
          [
            {
              id: `tx-out-${randomUUID()}`, facilityId, grnId: grn.id, grnNumber: grn.grnNumber,
              chamber: grn.chamber, commodityId: grn.commodityId, bagType: grn.bagType,
              transactionType: 'OUTWARD_DELIVERY', smallQuantity: outSmall, bigQuantity: outBig,
              referenceType: 'DELIVERY', referenceId: movementId,
              notes: `Stock adjustment for repacking (Lot ${grn.grnNumber})`,
              createdBy: userId, createdAt: movementDate,
            },
            {
              id: `tx-in-${randomUUID()}`, facilityId, grnId: grn.id, grnNumber: grn.grnNumber,
              chamber: destinationChamber, commodityId: grn.commodityId, bagType: input.resultingBagType,
              transactionType: 'INWARD_PUTAWAY', smallQuantity: inSmall, bigQuantity: inBig,
              referenceType: 'PUT_AWAY', referenceId: movementId,
              notes: `Repacked stock putaway (Lot ${grn.grnNumber})`,
              createdBy: userId, createdAt: movementDate,
            },
          ],
          { session, ordered: true },
        );

        const delivered = await readLedgerNetDelivered(facilityId, grn.id, session);

        // Update GRN document
        grn.chamber = destinationChamber;
        grn.bagType = input.resultingBagType;
        if (grn.hamaliAmount == null) {
          const effectiveIntakeRate = resolveEffectiveHamaliRate(grn.hamaliRate, commodity);
          grn.hamaliRate = effectiveIntakeRate;
          grn.hamaliAmount = calculateHamaliAmount(grn.bags, effectiveIntakeRate);
        }
        grn.bags = grn.bags + repackVariance;
        grn.smallBags = delivered.smallBags + inSmall;
        grn.bigBags = delivered.bigBags + inBig;
        grn.isCompositionVerified = true;
        grn.isSorted = false;
        if (input.remarks) grn.remarks = grn.remarks ? `${grn.remarks} | ${input.remarks}` : input.remarks;
        grn.updatedAt = movementDate;

        // Prospective subscription recalculation: Season 1 lots update rentAmount for continuing subscription
        if (
          seasonYearForInwardDate(grn.date) === seasonYearForInwardDate(movementDate) &&
          (grn.rentType === 'Seasonal' || grn.rentType === 'Seasonal_3M')
        ) {
          const effectiveBagPrice = grn.bagPrice ?? deriveBagPrice({
            rentType: grn.rentType, bags: bal.total, rentAmount: grn.rentAmount,
            smallBagPrice: grn.smallBagPrice, bigBagPrice: grn.bigBagPrice,
          });
          grn.rentAmount = calculateRentAmount({
            rentType: grn.rentType, bags: grn.bags, bagType: grn.bagType,
            smallBags: grn.smallBags, bigBags: grn.bigBags, bagPrice: effectiveBagPrice,
            smallBagPrice: grn.smallBagPrice, bigBagPrice: grn.bigBagPrice, rentAmount: grn.rentAmount,
          });
        }
        await grn.save({ session });

        // Authoritative rent obligation & balance snapshot (SSOT)
        const outwardInfo = await rentRepository.getOutwardRentInfoForGrn(facilityId, grn.id, session);
        const extensions = await RentExtensionModel.find({ facilityId, grnId: grn.id }, null, { session }).lean().exec();
        const hamaliShare = computeFirstSeasonHamali(grn.bags, commodity, extensions, grn.hamaliRate, grn.hamaliAmount);
        const totalDue = resolveTotalRentObligation({
          rentType: grn.rentType,
          rentAmount: grn.rentAmount,
          outwardRentCharges: outwardInfo.total,
          extensionAmounts: extensions.map((e) => e.finalAmount),
          hamaliShare,
        });
        const payments = await rentRepository.findPaymentsByGrnId(facilityId, grn.id, session);
        const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
        const rentBal = computeRentBalance(totalDue, totalPaid);

        // Record in InternalMovementModel for history and audit
        const movementDoc = await InternalMovementModel.create(
          [{
            id: movementId, facilityId, movementType: 'REPACK', movementDate,
            targetGrnId: grn.id, targetGrnNumber: grn.grnNumber,
            sourceGrnIds: [grn.id], sourceGrnNumbers: [grn.grnNumber],
            totalBagsMoved: actualRepackedBags,
            smallBagsMoved: isHybrid ? 0 : (input.repackedSmallBags ?? 0),
            bigBagsMoved: isHybrid ? 0 : (input.repackedBigBags ?? 0),
            hamaliBags: actualRepackedBags, hamaliRate, hamaliCharge: repackHamaliCharge,
            repackVariance, repackSourceBags: bal.total, referenceWeight: grn.totalBagsWeight,
            financialSnapshot: {
              rentAmount: rentBal.rentAmount, totalPaid: rentBal.totalPaid,
              remainingBalance: rentBal.remainingBalance, paymentStatus: rentBal.paymentStatus,
              rentState: rentBal.rentState, hamaliAmount: repackHamaliCharge,
            },
            remarks: input.repackVarianceReason ? `${input.remarks} (Variance: ${input.repackVarianceReason})` : input.remarks,
            idempotencyKey: input.idempotencyKey ?? null, performedBy: userId,
          }],
          { session, ordered: true },
        );

        resultGrn = toGrnEntity(grn.toObject());
        resultMovement = {
          ...movementDoc[0].toObject(),
          id: movementDoc[0].id,
          movementDate: new Date(movementDoc[0].movementDate),
          createdAt: new Date(movementDoc[0].createdAt),
        } as InternalMovementRecord;
      }),
    );
  } finally {
    await session.endSession();
  }

  await auditService.log({
    eventType: 'INTERNAL_MOVEMENT_REPACK',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: resultGrn.id,
    details: {
      grnNumber: resultGrn.grnNumber,
      destinationChamber: resultGrn.chamber,
      resultingBagType: input.resultingBagType,
      repackedBags: resultGrn.bags,
      repackVariance,
      repackVarianceReason: input.repackVarianceReason,
      hamaliCharge: repackHamaliCharge,
      totalBagsWeight: resultGrn.totalBagsWeight,
    },
  });

  return {
    grn: resultGrn,
    movement: resultMovement,
    repackVariance,
    hamaliCharge: repackHamaliCharge,
  };
}
