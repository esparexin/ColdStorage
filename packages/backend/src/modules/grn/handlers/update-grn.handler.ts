import mongoose from 'mongoose';
import type { CorrectGrnInput, Grn } from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { auditService } from '../../audit/audit.service.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';
import { commodityRateService } from '../../commodities/commodity-rate.service.js';
import { toGrnEntity } from '../grn.mappers.js';
import { resolveBagEdit, wantsBagsChange } from './grn-edit-bags.js';
import { resolveRentEdit, wantsRentChange } from './grn-edit-rent.js';
import {
  buildCorrectionAfter,
  buildCorrectionBefore,
  type CorrectionRecord,
} from './grn-edit-audit.js';
import { assertCorrectionAllowed, isStructuralEdit } from './grn-edit-guards.js';
import { applyDescriptiveEdits, persistCorrection } from './grn-edit-persist.js';

/**
 * Full edit of an inward receipt.
 *
 * The architecture lock forbids silently editing confirmed transactions; any edit must go
 * through this approved workflow that leaves an audit trail. Guardrails, bag/rent
 * resolution, persistence and audit snapshots live in sibling grn-edit-* modules so
 * this orchestrator stays within the line budget.
 */
export async function correctGrn(
  facilityId: string,
  grnId: string,
  input: CorrectGrnInput,
  userId: string,
): Promise<Grn> {
  const session = await mongoose.startSession();
  let corrected!: Grn;
  let record!: CorrectionRecord;

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

      const activeChallans = await DeliveryChallanModel.countDocuments(
        { facilityId, grnId, status: 'ISSUED' },
        { session },
      ).exec();
      const [challanCount, reversalCount] = await Promise.all([
        DeliveryChallanModel.countDocuments({ facilityId, grnId }, { session }).exec(),
        DeliveryReversalModel.countDocuments({ facilityId, grnId }, { session }).exec(),
      ]);

      const bagsChanged = wantsBagsChange(input);
      assertCorrectionAllowed(grn, {
        hasMovement: challanCount + reversalCount > 0,
        activeChallans,
        structural: isStructuralEdit(input, bagsChanged),
      });

      const before = buildCorrectionBefore(grn as unknown as Record<string, unknown>);
      const update: Record<string, unknown> = {};
      const inwardUpdate: Record<string, unknown> = {};

      if (input.customerId !== undefined) {
        const customer = await CustomerModel.findOne({ id: input.customerId })
          .lean()
          .exec();
        if (!customer) {
          throw new Error(`Customer '${input.customerId}' not found`);
        }
        if (!customer.isActive) {
          throw new Error(`Customer '${customer.name}' is inactive`);
        }
        if (!customer.facilityIds.includes(facilityId)) {
          throw new Error(
            `Customer '${customer.name}' is not registered for facility '${facilityId}'`,
          );
        }
        update.customerId = customer.id;
        update.customerName = customer.name;
      }

      if (input.date !== undefined) {
        update.date = validateOperationalDate(input.date, { label: 'Inward' });
      }

      if (input.commodityId !== undefined) {
        const commodity = await CommodityModel.findOne({ id: input.commodityId })
          .lean()
          .exec();
        if (!commodity) {
          throw new Error(`Commodity '${input.commodityId}' not found`);
        }
        if (!commodity.isActive) {
          throw new Error(`Commodity '${commodity.name}' is inactive`);
        }
        update.commodityId = commodity.id;
        update.commodityName = commodity.name;
        inwardUpdate.commodityId = commodity.id;
      }

      const bagEdit = resolveBagEdit(input, {
        bagType: grn.bagType,
        bags: grn.bags,
        smallBags: grn.smallBags,
        bigBags: grn.bigBags,
      });
      Object.assign(update, bagEdit.update);
      Object.assign(inwardUpdate, bagEdit.inwardUpdate);

      if (input.smallBagWeight !== undefined) {
        update.smallBagWeight = input.smallBagWeight ?? null;
      }
      if (input.bigBagWeight !== undefined) {
        update.bigBagWeight = input.bigBagWeight ?? null;
      }
      if (input.totalBagsWeight !== undefined) {
        update.totalBagsWeight = input.totalBagsWeight ?? null;
      }

      if (
        input.smallBagPrice !== undefined ||
        input.bigBagPrice !== undefined ||
        input.commodityId !== undefined ||
        input.rentType !== undefined
      ) {
        // Submitted agreed rates must match the active controller row when one
        // exists. Stored-but-unsubmitted values are history and never checked.
        await commodityRateService.validateSubmittedRates(
          input.commodityId ?? grn.commodityId,
          input.rentType ?? grn.rentType,
          { smallBagPrice: input.smallBagPrice, bigBagPrice: input.bigBagPrice },
          // Fail-closed correction gate lands in Phase 4; behavior unchanged here.
          { requireRates: false },
        );
      }

      if (wantsRentChange(input, bagEdit.wantsBagsChange)) {
        Object.assign(
          update,
          await resolveRentEdit({
            facilityId,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            grn: {
              rentType: grn.rentType,
              rentMonths: grn.rentMonths,
              rentAmount: grn.rentAmount,
              bagPrice: grn.bagPrice,
              smallBagPrice: grn.smallBagPrice,
              bigBagPrice: grn.bigBagPrice,
            },
            input,
            finalBags: bagEdit.finalBags,
            finalBagType: bagEdit.finalBagType,
            finalSmallBags: bagEdit.finalSmallBags,
            finalBigBags: bagEdit.finalBigBags,
            bagsChanged: bagEdit.wantsBagsChange,
            session,
          }),
        );
      }

      applyDescriptiveEdits(input, update, inwardUpdate);

      const updated = await persistCorrection({
        session,
        facilityId,
        grn,
        update,
        inwardUpdate,
        finalBagType: bagEdit.finalBagType,
        finalSmallBags: bagEdit.finalSmallBags,
        finalBigBags: bagEdit.finalBigBags,
        input,
        userId,
      });

      corrected = toGrnEntity(updated!);
      record = {
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        before,
        after: buildCorrectionAfter(corrected),
        reason: input.reason,
      };
    });
  } finally {
    await session.endSession();
  }

  await auditService.log({
    eventType: 'GRN_CORRECTED',
    severity: 'WARN',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: record.grnId,
    details: {
      grnNumber: record.grnNumber,
      reason: record.reason,
      before: record.before,
      after: record.after,
    },
  });

  return corrected;
}
