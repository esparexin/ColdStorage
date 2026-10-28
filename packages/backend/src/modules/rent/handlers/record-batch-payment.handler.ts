import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  type RecordBatchRentPaymentInput,
  type RecordBatchRentPaymentResult,
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
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { rentRepository } from '../rent.repository.js';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { computeFirstSeasonHamali } from '../../common/hamali-resolution.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';
import { toPaymentEntity } from './record-payment.handler.js';

interface SettledItem {
  paymentDoc: RentPaymentDoc;
  lockedGrn: GrnDoc;
  remainingBalance: number;
  paymentStatus: 'Settled' | 'Not Settled';
}

export async function executeRecordBatchPayment(
  facilityId: string,
  input: RecordBatchRentPaymentInput,
  userId: string,
  getRentSummary: (facilityId: string, grnId: string) => Promise<RentSummaryDto>,
): Promise<RecordBatchRentPaymentResult> {
  const paymentDate = validateOperationalDate(input.paymentDate, {
    label: 'Batch Payment',
    enforceFinancialYear: false,
    enforceBackdatingWindow: false,
  });

  // Sort allocations deterministically by grnId to prevent concurrent transaction deadlocks
  const sortedAllocations = [...input.allocations].sort((a, b) => a.grnId.localeCompare(b.grnId));
  const settledItems: SettledItem[] = [];

  const session = await mongoose.startSession();
  try {
    await withMongoRetry(() =>
      session.withTransaction(async () => {
        settledItems.length = 0;

        for (const alloc of sortedAllocations) {
          const grn = await GrnModel.findOneAndUpdate(
            { id: alloc.grnId, facilityId },
            { $set: { updatedAt: new Date() } },
            { session, new: true },
          )
            .lean<GrnDoc>()
            .exec();

          if (!grn) {
            throw new Error(`GRN '${alloc.grnId}' not found in facility '${facilityId}'`);
          }
          if (grn.customerId !== input.customerId) {
            throw new Error(
              `GRN '${grn.grnNumber}' belongs to customer '${grn.customerId}', not '${input.customerId}'`,
            );
          }

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
          const [commodity, extensions] = await Promise.all([
            CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec(),
            rentExtensionRepository.findExtensionsByGrn(facilityId, grn.id, session),
          ]);
          const hamaliShare =
            grn.rentAmount > 0
              ? computeFirstSeasonHamali(
                  grn.bags,
                  commodity,
                  extensions,
                  grn.hamaliRate,
                  grn.hamaliAmount,
                )
              : 0;
          const totalDue = await rentExtensionRepository.resolveTotalDue(
            facilityId,
            {
              id: grn.id,
              rentAmount: grn.rentAmount,
              rentType: grn.rentType,
              outwardRentCharges: outwardRent,
              hamaliShare,
            },
            session,
          );
          const balanceBefore = computeRentBalance(totalDue, totalPaidBefore);
          const remainingBalance = balanceBefore.remainingBalance;

          if (alloc.amountPaid > remainingBalance) {
            throw new Error(
              `Requested payment ₹${alloc.amountPaid} exceeds remaining rent balance of ₹${remainingBalance} for GRN '${grn.grnNumber}'`,
            );
          }

          const receiptNumber = await counterService.generateRentReceiptNumber(
            facilityId,
            paymentDate,
            session,
          );

          const paymentId = `rp-${randomUUID()}`;
          const paymentDoc = await rentRepository.createPayment(
            {
              id: paymentId,
              facilityId,
              grnId: grn.id,
              grnNumber: grn.grnNumber,
              receiptNumber,
              amountPaid: alloc.amountPaid,
              paymentMode: input.paymentMode,
              paymentDate,
              notes: input.notes?.trim() || null,
              createdBy: userId,
            },
            session,
          );

          const computedBalance = computeRentBalance(
            totalDue,
            totalPaidBefore + alloc.amountPaid,
          );

          if (computedBalance.remainingBalance === 0) {
            const balance = await readLedgerBalance(facilityId, grn.id, session);
            if (balance.total === 0) {
              await GrnModel.updateOne({ id: grn.id }, { $set: { status: 'CLOSED' } }, { session });
            }
          }

          settledItems.push({
            paymentDoc,
            lockedGrn: grn,
            remainingBalance: computedBalance.remainingBalance,
            paymentStatus: computedBalance.paymentStatus,
          });
        }
      }),
    );
  } finally {
    await session.endSession();
  }

  const payments: RentPayment[] = [];
  let totalAmountPaid = 0;
  let settledGrnCount = 0;

  for (const item of settledItems) {
    const payment = toPaymentEntity(item.paymentDoc);
    payments.push(payment);
    totalAmountPaid += item.paymentDoc.amountPaid;
    if (item.remainingBalance === 0) {
      settledGrnCount += 1;
    }

    await auditService.log({
      eventType: 'RENT_PAYMENT_COLLECTED',
      severity: 'INFO',
      userId,
      facilityId,
      resource: 'rent-payment',
      resourceId: payment.id,
      details: {
        grnId: item.lockedGrn.id,
        grnNumber: item.lockedGrn.grnNumber,
        receiptNumber: payment.receiptNumber,
        amountPaid: payment.amountPaid,
        paymentMode: payment.paymentMode,
        remainingBalance: item.remainingBalance,
        paymentStatus: item.paymentStatus,
        batch: true,
      },
    });
  }

  const summaries = await Promise.all(
    settledItems.map((item) => getRentSummary(facilityId, item.lockedGrn.id)),
  );

  return {
    payments,
    summaries,
    totalAmountPaid: Number(totalAmountPaid.toFixed(2)),
    settledGrnCount,
  };
}
