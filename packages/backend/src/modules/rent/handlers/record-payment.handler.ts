import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  type RecordRentPaymentInput,
  type RecordRentPaymentResult,
  type RentPayment,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import { GrnModel, type GrnDoc } from '../../../database/models/grn.model.js';
import type { RentPaymentDoc } from '../../../database/models/rent-payment.model.js';
import { auditService } from '../../audit/audit.service.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';
import { counterService } from '../../common/counter.service.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { rentExtensionRepository } from '../rent-extension.repository.js';
import { readAvailableBags } from '../../delivery/handlers/delivery-validation.helper.js';
import { rentRepository } from '../rent.repository.js';

export function toPaymentEntity(doc: RentPaymentDoc): RentPayment {
  return {
    id: doc.id,
    facilityId: doc.facilityId,
    grnId: doc.grnId,
    grnNumber: doc.grnNumber,
    receiptNumber: doc.receiptNumber,
    amountPaid: doc.amountPaid,
    paymentMode: doc.paymentMode,
    paymentDate: doc.paymentDate,
    notes: doc.notes ?? null,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}

export async function executeRecordPayment(
  facilityId: string,
  input: RecordRentPaymentInput,
  userId: string,
  getRentSummary: (facilityId: string, grnId: string) => Promise<RentSummaryDto>,
): Promise<RecordRentPaymentResult> {
  const session = await mongoose.startSession();
  let createdPaymentDoc: RentPaymentDoc;
  let lockedGrn: GrnDoc;
  let computedRemainingBalance: number;
  let computedPaymentStatus: 'Settled' | 'Not Settled' = 'Not Settled';

  try {
    await session.withTransaction(async () => {
      // 1. Acquire exclusive write-lock on the canonical GRN inside transaction
      const grn = await GrnModel.findOneAndUpdate(
        { id: input.grnId, facilityId },
        { $set: { updatedAt: new Date() } },
        { session, new: true },
      )
        .lean<GrnDoc>()
        .exec();

      if (!grn) {
        throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
      }
      lockedGrn = grn;

      // 2. Authoritative ledger aggregation inside transaction session.
      // The obligation is the total due: original Seasonal rent plus any
      // finalized January/February extensions (single-pool collection).
      const totalPaidBefore = await rentRepository.getTotalPaidForGrn(
        facilityId,
        grn.id,
        session,
      );
      const outwardRent = await rentRepository.getOutwardRentChargesForGrn(
        facilityId,
        grn.id,
        session,
      );
      const baseRent = grn.rentAmount > 0 ? grn.rentAmount : outwardRent;
      const totalDue = await rentExtensionRepository.resolveTotalDue(
        facilityId,
        { id: grn.id, rentAmount: baseRent },
        session,
      );
      const balanceBefore = computeRentBalance(totalDue, totalPaidBefore);
      const remainingBalance = balanceBefore.remainingBalance;

      // 3. Strict Overpayment Guard (Zero negative balance permitted per P0-Decision 9)
      if (input.amountPaid > remainingBalance) {
        throw new Error(
          `Requested payment ₹${input.amountPaid} exceeds remaining rent balance of ₹${remainingBalance} for GRN '${grn.grnNumber}'`,
        );
      }

      // 4. Validate payment date in Asia/Kolkata timezone with +5 min clock skew tolerance.
      // Backdated payment entry rules are explicitly parked in the P0 lock, so no
      // backdating window or financial-year containment is imposed here.
      const paymentDate = validateOperationalDate(input.paymentDate, {
        label: 'Payment',
        enforceFinancialYear: false,
        enforceBackdatingWindow: false,
      });

      // 5. Allocate independent FY-sequential rent receipt number inside the session
      const receiptNumber = await counterService.generateRentReceiptNumber(
        facilityId,
        paymentDate,
        session,
      );

      // 6. Insert RentPayment document inside the session
      const paymentId = `rp-${randomUUID()}`;
      createdPaymentDoc = await rentRepository.createPayment(
        {
          id: paymentId,
          facilityId,
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          receiptNumber,
          amountPaid: input.amountPaid,
          paymentMode: input.paymentMode,
          paymentDate,
          notes: input.notes?.trim() || null,
          createdBy: userId,
        },
        session,
      );

      const computedBalance = computeRentBalance(
        totalDue,
        totalPaidBefore + input.amountPaid,
      );
      computedRemainingBalance = computedBalance.remainingBalance;
      computedPaymentStatus = computedBalance.paymentStatus;

      // Closure invariant: A GRN is CLOSED only when both remainingBags === 0 AND remainingBalance === 0
      if (computedRemainingBalance === 0) {
        const remainingBags = await readAvailableBags(facilityId, grn.id, session);
        if (remainingBags === 0) {
          await GrnModel.updateOne({ id: grn.id }, { $set: { status: 'CLOSED' } }, { session });
        }
      }
    });
  } finally {
    await session.endSession();
  }

  const paymentEntity = toPaymentEntity(createdPaymentDoc!);

  // 7. Post-commit non-blocking audit logging (aligned strictly with P10)
  await auditService.log({
    eventType: 'RENT_PAYMENT_COLLECTED',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'rent-payment',
    resourceId: paymentEntity.id,
    details: {
      grnId: lockedGrn!.id,
      grnNumber: lockedGrn!.grnNumber,
      receiptNumber: paymentEntity.receiptNumber,
      amountPaid: paymentEntity.amountPaid,
      paymentMode: paymentEntity.paymentMode,
      remainingBalance: computedRemainingBalance!,
      paymentStatus: computedPaymentStatus,
    },
  });

  const summary = await getRentSummary(facilityId, lockedGrn!.id);
  return {
    payment: paymentEntity,
    summary,
  };
}
