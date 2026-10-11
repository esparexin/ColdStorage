import type mongoose from 'mongoose';
import {
  calculateMonthlyElapsedCycles,
  calculateRentAmount,
  resolveOutwardRates,
  resolveSeasonalElapsedPeriods,
  type BagComposition,
  type RentType,
} from '@cold-storage/contracts';
import { CommodityRateModel } from '../../../database/models/commodity-rate.model.js';

export interface ComputeDeliveryRentParams {
  grn: {
    id: string;
    date: Date;
    rentType: RentType;
    commodityId: string;
    smallBagPrice?: number | null;
    bigBagPrice?: number | null;
    bagPrice?: number | null;
  };
  withdrawal: BagComposition;
  deliveryDate: Date;
  session: mongoose.ClientSession;
}

/**
 * Calculates the expected rent charge for outward delivery.
 * For Seasonal rent, computes multi-period elapsed seasons and extensions:
 * - March-December: Full season rate
 * - January & February: Monthly rate from Commodity Rate Table
 * - March 1 renewals: Full renewal rate (Option A Standard Seasonal Rule)
 */
export async function computeExpectedDeliveryRent(
  params: ComputeDeliveryRentParams,
): Promise<{ expectedRentCharge: number; effectiveRates: { small: number; big: number } }> {
  const { grn, withdrawal, deliveryDate, session } = params;
  const withdrawnTotal = withdrawal.smallBags + withdrawal.bigBags;
  const effectiveRates = resolveOutwardRates(grn.rentType, {
    smallBagPrice: grn.smallBagPrice,
    bigBagPrice: grn.bigBagPrice,
    bagPrice: grn.bagPrice,
  });

  if (grn.rentType === 'Seasonal') {
    const elapsedPeriods = resolveSeasonalElapsedPeriods(grn.date, deliveryDate);

    const seasonalRateDoc =
      grn.smallBagPrice == null && grn.bigBagPrice == null && grn.bagPrice == null
        ? await CommodityRateModel.findOne({
            commodityId: grn.commodityId,
            rentType: 'Seasonal',
            isActive: true,
          }).session(session)
        : null;

    const seasonalRates = seasonalRateDoc
      ? { small: seasonalRateDoc.smallRate, big: seasonalRateDoc.bigRate }
      : effectiveRates;

    const monthlyRateDoc = await CommodityRateModel.findOne({
      commodityId: grn.commodityId,
      rentType: 'Monthly',
      isActive: true,
    }).session(session);

    const monthlyRates = monthlyRateDoc
      ? { small: monthlyRateDoc.smallRate, big: monthlyRateDoc.bigRate }
      : seasonalRates;

    let totalSeasonalRent = 0;
    for (const p of elapsedPeriods) {
      const rates = p.period === 'SEASON' ? seasonalRates : monthlyRates;
      const periodRent = calculateRentAmount({
        rentType: p.period === 'SEASON' ? 'Seasonal' : 'Monthly',
        bags: withdrawnTotal,
        bagType: 'S+B',
        smallBags: withdrawal.smallBags,
        bigBags: withdrawal.bigBags,
        smallBagPrice: rates.small,
        bigBagPrice: rates.big,
        rentMonths: 1,
      });
      totalSeasonalRent += periodRent;
    }

    return { expectedRentCharge: totalSeasonalRent, effectiveRates: seasonalRates };
  }

  const monthlyRateDoc =
    grn.smallBagPrice == null && grn.bigBagPrice == null && grn.bagPrice == null
      ? await CommodityRateModel.findOne({
          commodityId: grn.commodityId,
          rentType: 'Monthly',
          isActive: true,
        }).session(session)
      : null;

  const monthlyEffectiveRates = monthlyRateDoc
    ? { small: monthlyRateDoc.smallRate, big: monthlyRateDoc.bigRate }
    : effectiveRates;

  const billableMonths = calculateMonthlyElapsedCycles(grn.date, deliveryDate);
  const expectedRentCharge = calculateRentAmount({
    rentType: 'Monthly',
    bags: withdrawnTotal,
    bagType: 'S+B',
    smallBags: withdrawal.smallBags,
    bigBags: withdrawal.bigBags,
    smallBagPrice: monthlyEffectiveRates.small,
    bigBagPrice: monthlyEffectiveRates.big,
    rentMonths: billableMonths,
  });

  return { expectedRentCharge, effectiveRates: monthlyEffectiveRates };
}
