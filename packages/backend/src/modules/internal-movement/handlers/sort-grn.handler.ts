import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  getFinancialYearKey,
  resolveTotalRentObligation,
  toOperationalBagType,
  type Grn,
  type RentPayment,
  type SortGrnInput,
  type SortGrnResult,
} from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { RentExtensionModel } from '../../../database/models/rent-extension.model.js';
import { counterService } from '../../common/counter.service.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { computeFirstSeasonHamali, resolveEffectiveHamaliRate } from '../../common/hamali-resolution.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';

export async function executeSortGrn(
  facilityId: string,
  input: SortGrnInput,
  userId: string,
): Promise<SortGrnResult> {
  const session = await mongoose.startSession();
  let resultGrn!: Grn;
  let resultPayment: RentPayment | undefined;
  let resultReceiptNumber: string | undefined;
  let billedAmount = 0;

  try {
    await withMongoRetry(() =>
      session.withTransaction(async () => {
        const grn = await GrnModel.findOne({ id: input.grnId, facilityId }, null, { session });
        if (!grn) {
          throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
        }
        if (grn.status === 'CLOSED') {
          throw new Error(`Cannot perform sorting on CLOSED GRN '${grn.grnNumber}'`);
        }
        if (grn.loanStatus === 'TAKEN') {
          throw new Error(`Cannot perform sorting: Active loan hold against GRN '${grn.grnNumber}'`);
        }
        if (grn.isSorted) {
          resultGrn = toGrnEntity(grn.toObject());
          return;
        }

        // 1. Mandatory Confirmation Check
        const bal = await readLedgerBalance(facilityId, grn.id, session);
        if (bal.total <= 0) {
          throw new Error(`Cannot perform sorting: No stock remaining in GRN '${grn.grnNumber}'`);
        }
        if (input.confirmedBags !== bal.total) {
          throw new Error(
            `CONFIRMATION_MISMATCH: Confirmed bags (${input.confirmedBags}) does not match existing stock (${bal.total})`,
          );
        }
        const expectedBagType = toOperationalBagType(grn.bagType);
        if (input.confirmedBagType !== expectedBagType) {
          throw new Error(
            `CONFIRMATION_MISMATCH: Confirmed bag type (${input.confirmedBagType}) does not match existing bag type (${grn.bagType})`,
          );
        }

        // Optional weight confirmation / update
        if (typeof input.totalBagsWeight === 'number' && input.totalBagsWeight > 0) {
          grn.totalBagsWeight = input.totalBagsWeight;
        }

        // 2. Rent Recalculation & Bill Generation Gate
        const outwardInfo = await rentRepository.getOutwardRentInfoForGrn(facilityId, grn.id, session);
        const extensions = await RentExtensionModel.find({ facilityId, grnId: grn.id }, null, { session }).lean().exec();
        const commodity = await CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec();
        const hamaliShare = computeFirstSeasonHamali(grn.bags, commodity, extensions, grn.hamaliRate, grn.hamaliAmount);
        if (grn.hamaliAmount == null) {
          grn.hamaliRate = resolveEffectiveHamaliRate(grn.hamaliRate, commodity);
          grn.hamaliAmount = hamaliShare;
        }

        const totalDue = resolveTotalRentObligation({
          rentType: grn.rentType,
          rentAmount: grn.rentAmount,
          outwardRentCharges: outwardInfo.total,
          extensionAmounts: extensions.map((e) => e.finalAmount),
          hamaliShare,
        });

        const payments = await rentRepository.findPaymentsByGrnId(facilityId, grn.id, session);
        const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
        const remainingDue = Math.max(0, Number((totalDue - totalPaid).toFixed(2)));

        const currentFy = getFinancialYearKey(new Date());
        const grnFy = getFinancialYearKey(new Date(grn.date));
        const isPreviousFinancialYear = grnFy !== currentFy;

        // When GRN belongs to a previous financial year, preserve historical rent as pending
        // against the original bill, customer, and GRN profile. Do not auto-settle or fabricate
        // current-year payments against historical debt.
        if (remainingDue > 0 && !isPreviousFinancialYear) {
          const receiptNumber = await counterService.generateRentReceiptNumber(facilityId, new Date(), session);
          const paymentDoc = await rentRepository.createPayment(
            {
              id: `rent-pay-${randomUUID()}`,
              facilityId,
              grnId: grn.id,
              grnNumber: grn.grnNumber,
              customerId: grn.customerId,
              customerName: grn.customerName,
              receiptNumber,
              amountPaid: remainingDue,
              paymentMode: input.paymentMode ?? 'Cash',
              paymentDate: new Date(),
              notes: input.paymentNotes?.trim() || `Sorting confirmation bill: GRN ${grn.grnNumber}`,
              createdBy: userId,
            },
            session,
          );

          resultPayment = {
            id: paymentDoc.id,
            facilityId: paymentDoc.facilityId,
            grnId: paymentDoc.grnId,
            grnNumber: paymentDoc.grnNumber,
            customerId: paymentDoc.customerId ?? null,
            customerName: paymentDoc.customerName ?? null,
            receiptNumber: paymentDoc.receiptNumber,
            amountPaid: paymentDoc.amountPaid,
            paymentMode: paymentDoc.paymentMode,
            paymentDate: new Date(paymentDoc.paymentDate),
            notes: paymentDoc.notes,
            createdBy: paymentDoc.createdBy,
            createdAt: new Date(paymentDoc.createdAt),
          };
          resultReceiptNumber = receiptNumber;
          billedAmount = remainingDue;
        }

        // 3. Mark sorting confirmation complete
        grn.isSorted = true;
        grn.sortedAt = new Date();
        grn.updatedAt = new Date();
        await grn.save({ session });

        resultGrn = toGrnEntity(grn.toObject());
      }),
    );
  } finally {
    await session.endSession();
  }

  await auditService.log({
    eventType: 'GRN_SORTED',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: resultGrn.id,
    details: {
      grnNumber: resultGrn.grnNumber,
      confirmedBagType: input.confirmedBagType,
      confirmedBags: input.confirmedBags,
      totalBagsWeight: resultGrn.totalBagsWeight,
      billedAmount,
      receiptNumber: resultReceiptNumber,
    },
  });

  return {
    grn: resultGrn,
    payment: resultPayment,
    receiptNumber: resultReceiptNumber,
    billedAmount,
    isSortingComplete: true,
  };
}
