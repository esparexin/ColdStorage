import mongoose from 'mongoose';
import {
  getFinancialYearKey,
  resolveTotalRentObligation,
  seasonYearForInwardDate,
  toOperationalBagType,
  type Grn,
  type RentPayment,
  type SortGrnInput,
  type SortGrnResult,
} from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { RentExtensionModel } from '../../../database/models/rent-extension.model.js';
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
  const resultPayment: RentPayment | undefined = undefined;
  const resultReceiptNumber: string | undefined = undefined;
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

        // Validate and apply confirmed small and big bags composition for S/B lots when supplied
        if (
          input.confirmedBagType === 'S/B' &&
          (input.confirmedSmallBags != null || input.confirmedBigBags != null)
        ) {
          const small = input.confirmedSmallBags ?? 0;
          const big = input.confirmedBigBags ?? 0;
          if (small < 0 || big < 0 || !Number.isInteger(small) || !Number.isInteger(big)) {
            throw new Error('Confirmed small and big bags must be non-negative whole numbers');
          }
          if (small + big !== bal.total) {
            throw new Error(
              `CONFIRMATION_MISMATCH: Sum of small (${small}) and big (${big}) bags does not match existing stock (${bal.total})`,
            );
          }
          grn.smallBags = small;
          grn.bigBags = big;
          grn.isCompositionVerified = true;
        } else if (input.confirmedBagType === 'Hybrid') {
          grn.isCompositionVerified = true;
        }

        // Optional weight confirmation / update
        if (typeof input.totalBagsWeight === 'number' && input.totalBagsWeight > 0) {
          grn.totalBagsWeight = input.totalBagsWeight;
        }

        // 2. Rent Recalculation & Historical Settlement Gate (Excluding Active Subscription)
        const outwardInfo = await rentRepository.getOutwardRentInfoForGrn(facilityId, grn.id, session);
        const extensions = await RentExtensionModel.find({ facilityId, grnId: grn.id }, null, { session }).lean().exec();
        const commodity = await CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec();
        const hamaliShare = computeFirstSeasonHamali(grn.bags, commodity, extensions, grn.hamaliRate, grn.hamaliAmount);
        if (grn.hamaliAmount == null) {
          grn.hamaliRate = resolveEffectiveHamaliRate(grn.hamaliRate, commodity);
          grn.hamaliAmount = hamaliShare;
        }

        const payments = await rentRepository.findPaymentsByGrnId(facilityId, grn.id, session);
        const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);

        const currentSeasonYear = seasonYearForInwardDate(new Date());
        const grnSeasonYear = seasonYearForInwardDate(grn.date);
        const isCurrentSeasonLot = grnSeasonYear === currentSeasonYear;

        // Current active subscription is strictly excluded from Step 1 settlement.
        // For current-season lots (e.g. GRN 0021), Season 1 is active, so historical dues prior to it are ₹0.
        // For multi-season lots, Season 1 and prior extensions are historical obligations.
        const historicalRentAmount = isCurrentSeasonLot ? 0 : grn.rentAmount;
        const historicalExtensions = isCurrentSeasonLot
          ? []
          : extensions
              .filter((e) => !(e.seasonYear === currentSeasonYear && e.period === 'SEASON'))
              .map((e) => e.finalAmount);

        const historicalTotalDue = resolveTotalRentObligation({
          rentType: grn.rentType,
          rentAmount: historicalRentAmount,
          outwardRentCharges: outwardInfo.total,
          extensionAmounts: historicalExtensions,
          hamaliShare: isCurrentSeasonLot ? 0 : hamaliShare,
        });

        const currentFy = getFinancialYearKey(new Date());
        const grnFy = getFinancialYearKey(new Date(grn.date));
        const isPreviousFinancialYear = grnFy !== currentFy;

        // When GRN belongs to a previous financial year, preserve historical rent as pending
        // against the original bill, customer, and GRN profile. Do not auto-settle or fabricate
        // current-year payments against historical debt.
        const outstandingHistoricalDue = isPreviousFinancialYear
          ? 0
          : Math.max(0, Number((historicalTotalDue - totalPaid).toFixed(2)));
        billedAmount = outstandingHistoricalDue;

        // 3. Mark sorting confirmation complete (active subscription continues post-repack)
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
