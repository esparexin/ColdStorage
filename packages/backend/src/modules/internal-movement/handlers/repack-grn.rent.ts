import type { ClientSession } from 'mongoose';
import {
  calculateRentAmount, deriveBagPrice, resolveTotalRentObligation,
  seasonYearForInwardDate,
} from '@cold-storage/contracts';
import type { GrnDoc } from '../../../database/models/grn.model.js';
import { RentExtensionModel } from '../../../database/models/rent-extension.model.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { computeRentBalance, type RentBalance } from '../../common/rent-balance.js';
import { computeFirstSeasonHamali, type HamaliCommodityConfig } from '../../common/hamali-resolution.js';

export interface RecalculateRepackRentInput {
  grn: GrnDoc;
  previousTotalBags: number;
  actualRepackedBags: number;
  inSmall: number;
  inBig: number;
  movementDate: Date;
}

/**
 * Prospective subscription recalculation: Continue ONLY newly repacked quantity into live running subscription.
 */
export function updateRepackProspectiveRent(input: RecalculateRepackRentInput): void {
  const { grn, previousTotalBags, actualRepackedBags, inSmall, inBig, movementDate } = input;
  if (
    seasonYearForInwardDate(grn.date) === seasonYearForInwardDate(movementDate) &&
    (grn.rentType === 'Seasonal' || grn.rentType === 'Seasonal_3M')
  ) {
    const effectiveBagPrice = grn.bagPrice ?? deriveBagPrice({
      rentType: grn.rentType, bags: previousTotalBags, rentAmount: grn.rentAmount,
      smallBagPrice: grn.smallBagPrice, bigBagPrice: grn.bigBagPrice,
    });
    grn.rentAmount = calculateRentAmount({
      rentType: grn.rentType, bags: actualRepackedBags, bagType: grn.bagType,
      smallBags: inSmall, bigBags: inBig, bagPrice: effectiveBagPrice,
      smallBagPrice: grn.smallBagPrice, bigBagPrice: grn.bigBagPrice, rentAmount: grn.rentAmount,
    });
  }
}

/**
 * Authoritative rent obligation & balance snapshot (SSOT) after repacking.
 */
export async function snapshotRepackRentObligation(
  facilityId: string,
  grn: GrnDoc,
  commodity: HamaliCommodityConfig | null | undefined,
  session: ClientSession,
): Promise<RentBalance> {
  const outwardInfo = await rentRepository.getOutwardRentInfoForGrn(facilityId, grn.id, session);
  const extensions = await RentExtensionModel.find({ facilityId, grnId: grn.id }, null, { session }).lean().exec();
  const hamaliShare = computeFirstSeasonHamali(grn.bags, commodity, extensions, grn.hamaliRate, grn.hamaliAmount);
  const totalDue = resolveTotalRentObligation({
    rentType: grn.rentType, rentAmount: grn.rentAmount, outwardRentCharges: outwardInfo.total,
    extensionAmounts: extensions.map((e) => e.finalAmount), hamaliShare,
  });
  const payments = await rentRepository.findPaymentsByGrnId(facilityId, grn.id, session);
  const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  return computeRentBalance(totalDue, totalPaid);
}
