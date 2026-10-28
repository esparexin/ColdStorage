import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  type CreateDeliveryInput,
  type DeliveryChallan,
  type DeliverySummary,
  toExcludedPeriodKeys,
} from '@cold-storage/contracts';
import { ConcurrencyConflictError } from '../../inventory/inventory.service.js';
import { counterService } from '../../common/counter.service.js';
import { DeliveryChallanModel, type DeliveryChallanDoc } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { auditService } from '../../audit/audit.service.js';
import { assertRentAllowedForOutward } from '../../common/rent-gate.service.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';
import { isTransientError, toChallanEntity } from '../delivery.mappers.js';
import { getDeliverySummary } from '../queries/delivery.queries.js';
import { resolveFirstSeasonOutwardShare } from './delivery-hamali.helper.js';
import { recordDeliveryInlinePayment, resolveEffectiveDeliveryObligation } from './delivery-payment.helper.js';
import { resolveSafeLedgerDrawdown, validateDeliveryDate } from './delivery-validation.helper.js';
import { resolveDeliveryPlan } from './delivery-plan.helper.js';
import { resolveDeliveryConflict, checkPreTransactionReplay, resolveIdempotentDeliveryTx } from './delivery-idempotency.helper.js';
import { resolveDeliveryGpNumber } from './delivery-gp.helper.js';

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
      const conflict = await resolveDeliveryConflict(facilityId, input as never, err);
      if (conflict) return conflict;
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
  const idemKey = (input as Record<string, unknown>).idempotencyKey as string | null | undefined;
  const earlyReplay = await checkPreTransactionReplay(facilityId, input as never);
  if (earlyReplay) return earlyReplay;
  const session = await mongoose.startSession();
  let createdChallanDoc: DeliveryChallanDoc;
  let txReplay: { delivery: DeliveryChallan; summary: DeliverySummary } | null = null;

  try {
    await session.withTransaction(async () => {
      if (typeof idemKey === 'string' && idemKey.length > 0) {
        txReplay = await resolveIdempotentDeliveryTx(facilityId, idemKey, input as never, session);
        if (txReplay) return;
      }
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

      const deliveryDate = validateDeliveryDate(input.date, grn.date);
      const billedPeriods = toExcludedPeriodKeys(await rentExtensionRepository.findExtensionsByGrn(facilityId, grn.id, session));
      const plan = await resolveDeliveryPlan({
        facilityId, grn, input, deliveryDate, session, billedPeriods,
      });
      const { isHybrid, finalSmall, finalBig, withdrawnTotal, expectedRentCharge, available, hasUnclassifiedGenesis } = plan;

      if (input.rentCharge != null && input.rentCharge >= 0) {
        if (Math.abs(input.rentCharge - expectedRentCharge) > 0.01) {
          throw new Error(
            `rentCharge mismatch: expected ₹${expectedRentCharge.toLocaleString('en-IN')}, received ₹${input.rentCharge.toLocaleString('en-IN')}`,
          );
        }
      }
      // Internal first-season Hamali share joins the delivery rent charge (R1/R2).
      const { share: hamaliShare } = await resolveFirstSeasonOutwardShare({
        facilityId, grn, withdrawnTotal, expectedRentCharge, session,
      });
      const deliveryRentCharge = Number((expectedRentCharge + hamaliShare).toFixed(2));
      // The full obligation input (W2): the gate cannot resolve a correct
      // balance from rentAmount alone, because rent for many GRNs is carried
      // on the outward challans rather than stored.
      const rentBalance = await assertRentAllowedForOutward(facilityId, { ...grn, rentAmount: grn.rentAmount ?? 0 }, session);

      const challanNumber = await counterService.generateDeliveryChallanNumber(facilityId, deliveryDate, session);
      const deliveryId = `del-${randomUUID()}`;

      const marks = input.marks?.trim() || grn.marks || null;
      const gpNumber = await resolveDeliveryGpNumber(facilityId, input.gpNumber, deliveryDate, session);

      const challanDocs = await DeliveryChallanModel.create(
        [
          {
            id: deliveryId, facilityId, challanNumber, date: deliveryDate,
            grnId: grn.id, grnNumber: grn.grnNumber, customerId: grn.customerId, customerName: grn.customerName,
            commodityId: grn.commodityId, commodityName: grn.commodityName, chamber: grn.chamber,
            bagType: isHybrid ? 'Hybrid' : (input.bagType ?? grn.bagType ?? 'S/B'), bagCategory: input.bagCategory || null, bagPrice: input.bagPrice ?? null,
            seasonalBagPrice: input.seasonalBagPrice ?? null, monthlyBagPrice: input.monthlyBagPrice ?? null,
            smallBags: finalSmall, bigBags: finalBig, marks, gpNumber,
            vehicleNumber: input.vehicleNumber?.trim().toUpperCase() || null, driverName: input.driverName?.trim() || null,
            weight: input.weight ?? null, remarks: input.remarks?.trim() || null,
            rentCharge: deliveryRentCharge, status: 'ISSUED', issuedBy: userId,
            idempotencyKey: idemKey ?? null,
            unclassifiedDispatch: input.unclassifiedDispatch ?? null,
            confirmedDispatch: input.confirmedDispatch ?? null,
          },
        ],
        { session, ordered: true },
      );
      createdChallanDoc = challanDocs[0];

      const { smallQuantity: txSmall, bigQuantity: txBig } = resolveSafeLedgerDrawdown(
        isHybrid, grn.bagType, finalSmall, finalBig, available, hasUnclassifiedGenesis,
      );

      await InventoryTransactionModel.create(
        [
          {
            id: `tx-${randomUUID()}`,
            facilityId,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            chamber: grn.chamber,
            commodityId: grn.commodityId,
            bagType: isHybrid ? 'Hybrid' : (input.bagType ?? grn.bagType ?? 'S/B'),
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

      const effectiveObligation = await resolveEffectiveDeliveryObligation(facilityId, grn, session);
      const remainingLiability = Math.max(0, Number((effectiveObligation - rentBalance.totalPaid).toFixed(2)));

      const { paidAmount } = await recordDeliveryInlinePayment({
        facilityId, grnId: grn.id, grnNumber: grn.grnNumber,
        customerId: grn.customerId, customerName: grn.customerName,
        deliveryDate,
        paymentAmount: input.paymentAmount, paymentMode: input.paymentMode, paymentReference: input.paymentReference,
        remainingLiability, userId, session,
      });

      const closingTotal = available.total - withdrawnTotal;
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

  if (txReplay) return txReplay;
  const delivery = toChallanEntity(createdChallanDoc!);
  const summary = await getDeliverySummary(facilityId, input.grnId);

  await auditService.log({
    eventType: 'DELIVERY_ISSUED', severity: 'INFO', userId, facilityId, resource: 'delivery', resourceId: delivery.id,
    details: {
      activityDate: delivery.date instanceof Date ? delivery.date.toISOString().split('T')[0] : String(delivery.date).split('T')[0],
      challanNumber: delivery.challanNumber, grnId: delivery.grnId, grnNumber: delivery.grnNumber,
      customerId: delivery.customerId, customerName: delivery.customerName,
      bagType: delivery.bagType, bagCategory: delivery.bagCategory,
      totalBags: delivery.totalBags, smallBags: delivery.smallBags, bigBags: delivery.bigBags,
      rentCharge: delivery.rentCharge,
    },
  });

  return { delivery, summary };
}
