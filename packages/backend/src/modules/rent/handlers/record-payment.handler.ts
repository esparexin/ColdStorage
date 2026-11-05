import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  type RecordRentPaymentInput,
  type RecordRentPaymentResult,
  type RentPayment,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import { GrnModel, type GrnDoc } from '../../../database/models/grn.model.js';
import { DeliveryChallanModel, type DeliveryChallanDoc } from '../../../database/models/delivery-challan.model.js';
import { RentPaymentModel, type RentPaymentDoc } from '../../../database/models/rent-payment.model.js';
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

export function toPaymentEntity(doc: RentPaymentDoc): RentPayment {
  return {
    id: doc.id,
    facilityId: doc.facilityId,
    grnId: doc.grnId,
    grnNumber: doc.grnNumber,
    customerId: doc.customerId ?? null,
    customerName: doc.customerName ?? null,
    deliveryId: doc.deliveryId ?? null,
    challanNumber: doc.challanNumber ?? null,
    gpNumber: doc.gpNumber ?? null,
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
    await withMongoRetry(() =>
      session.withTransaction(async () => {
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
              // Base selection and the Hamali join both belong to the rent-obligation
              // SSOT (W2). This handler previously recomputed them inline, which is how
              // the six competing derivations arose; it now only supplies inputs.
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

              let targetDelivery: DeliveryChallanDoc | null = null;
              if (input.deliveryId) {
                targetDelivery = await DeliveryChallanModel.findOne(
                  { id: input.deliveryId, facilityId, grnId: grn.id, status: 'ISSUED' },
                  null,
                  { session },
                );
                if (!targetDelivery) {
                  throw new Error(
                    `Delivery challan '${input.deliveryId}' not found for GRN '${grn.grnNumber}'`,
                  );
                }
                const deliveryPaidDocs = await RentPaymentModel.find(
                  { facilityId, deliveryId: targetDelivery.id },
                  null,
                  { session },
                ).lean();
                const deliveryPaidBefore = deliveryPaidDocs.reduce((sum, p) => sum + p.amountPaid, 0);
                const deliveryRentCharge = targetDelivery.rentCharge ?? 0;
                const deliveryRemaining = Math.max(
                  0,
                  Number((deliveryRentCharge - deliveryPaidBefore).toFixed(2)),
                );

                if (input.amountPaid > deliveryRemaining) {
                  throw new Error(
                    `Requested payment ₹${input.amountPaid} exceeds remaining rent balance of ₹${deliveryRemaining} for Delivery Challan '${targetDelivery.challanNumber}'`,
                  );
                }
              }

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
                  customerId: grn.customerId,
                  customerName: grn.customerName,
                  deliveryId: targetDelivery?.id ?? null,
                  challanNumber: targetDelivery?.challanNumber ?? input.challanNumber ?? null,
                  gpNumber: targetDelivery?.gpNumber ?? null,
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
                // Direct ledger read breaks the rent->delivery static cycle (F10);
                // semantics identical to readAvailableBags (balance.total).
                const balance = await readLedgerBalance(facilityId, grn.id, session);
                if (balance.total === 0) {
                  await GrnModel.updateOne({ id: grn.id }, { $set: { status: 'CLOSED' } }, { session });
                }
              }
      }),
    );
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
