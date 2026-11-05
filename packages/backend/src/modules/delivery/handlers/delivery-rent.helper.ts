import type mongoose from 'mongoose';
import {
  calculate3MAdditionalMonths, calculateMonthlyElapsedCycles, calculateOutwardSeasonalBreakdown,
  calculateRentAmount, isHybridBagCategory, resolveOutwardRates, resolveSeasonalElapsedPeriods,
  shouldEvaluateSeasonalBreakdown,
  type BagComposition, type RentType,
} from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { CommodityRateModel } from '../../../database/models/commodity-rate.model.js';
import { resolveEffectiveHamaliRate } from '../../common/hamali-resolution.js';

export interface ComputeDeliveryRentParams {
  grn: {
    id: string;
    grnNumber?: string;
    date: Date;
    rentType: RentType;
    commodityId: string;
    smallBagPrice?: number | null;
    bigBagPrice?: number | null;
    bagPrice?: number | null;
    hamaliRate?: number | null;
  };
  withdrawal: BagComposition;
  quantity?: number | null;
  deliveryDate: Date;
  session: mongoose.ClientSession;
  bagType?: string | null; bagCategory?: string | null;
  bagPrice?: number | null;
  seasonalBagPrice?: number | null;
  monthlyBagPrice?: number | null;
  /** Elapsed-period keys already billed via finalized extensions; skipped to prevent double-count. */
  excludePeriodKeys?: string[] | null;
}

/**
 * Calculates the expected rent charge for outward delivery.
 * For Seasonal rent, computes multi-period elapsed seasons and extensions:
 * - March-December: Full season rate
 * - January & February: Monthly rate from Commodity Rate Table (or manual monthlyBagPrice for Hybrid)
 * - March 1 renewals: Full renewal rate (Option A Standard Seasonal Rule)
 *
 * Rate hierarchy (D2): GRN agreed rates win outright; else the active
 * controller row for the period kind; else the canonical 10/15 reference with
 * a warn log so the fallback is auditable instead of silent. Legacy and
 * rate-unconfigured lots keep billing exactly as before.
 */
export async function computeExpectedDeliveryRent(
  params: ComputeDeliveryRentParams,
): Promise<{ expectedRentCharge: number; effectiveRates: { small: number; big: number } }> {
  const { grn, withdrawal, deliveryDate, session } = params;
  const isHybrid = params.bagType === 'Hybrid' || isHybridBagCategory(params.bagCategory);
  const withdrawnTotal =
    isHybrid && typeof params.quantity === 'number' && params.quantity > 0
      ? params.quantity
      : withdrawal.smallBags + withdrawal.bigBags;

  const isSeasonalEval = shouldEvaluateSeasonalBreakdown({
    rentType: grn.rentType,
    inwardDate: grn.date,
    deliveryDate,
  });

  let effectiveHamaliRate: number | null = typeof grn.hamaliRate === 'number' ? grn.hamaliRate : null;
  if (effectiveHamaliRate === null && grn.commodityId && (isSeasonalEval || grn.rentType === 'Seasonal_3M')) {
    const commodityDoc = await CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec();
    effectiveHamaliRate = resolveEffectiveHamaliRate(null, commodityDoc);
  }

  if (isHybrid) {
    let sRate = params.seasonalBagPrice ?? params.bagPrice ?? grn.bagPrice ?? 0;
    let mRate = params.monthlyBagPrice ?? params.bagPrice ?? grn.bagPrice ?? 0;

    if (mRate === 0 && (grn.rentType === 'Monthly' || grn.rentType === 'Seasonal_3M' || isSeasonalEval)) {
      const monthlyRateDoc = await CommodityRateModel.findOne({
        commodityId: grn.commodityId,
        rentType: 'Monthly',
        isActive: true,
      }).session(session);
      if (monthlyRateDoc) {
        mRate = monthlyRateDoc.smallRate;
      }
    }
    if (sRate === 0 && (grn.rentType === 'Seasonal' || grn.rentType === 'Seasonal_3M' || isSeasonalEval)) {
      const seasonalRateDoc = await CommodityRateModel.findOne({
        commodityId: grn.commodityId,
        rentType: 'Seasonal',
        isActive: true,
      }).session(session);
      if (seasonalRateDoc) {
        sRate = seasonalRateDoc.smallRate;
      }
    }

    if (grn.rentType === 'Seasonal_3M') {
      const extraMonths = calculate3MAdditionalMonths(grn.date, deliveryDate);
      const baseRent = calculateRentAmount({
        rentType: 'Seasonal_3M',
        bags: withdrawnTotal,
        bagCategory: params.bagCategory,
        bagPrice: sRate,
        rentMonths: 1,
      });
      const extraRent = extraMonths > 0 ? calculateRentAmount({
        rentType: 'Monthly',
        bags: withdrawnTotal,
        bagCategory: params.bagCategory,
        bagPrice: mRate,
        rentMonths: extraMonths,
      }) : 0;
      return { expectedRentCharge: baseRent + extraRent, effectiveRates: { small: sRate, big: sRate } };
    }

    if (isSeasonalEval) {
      const breakdown = calculateOutwardSeasonalBreakdown({
        inwardDate: grn.date,
        deliveryDate,
        smallBags: withdrawnTotal,
        bigBags: 0,
        seasonalRates: { small: sRate, big: sRate },
        monthlyRates: { small: mRate, big: mRate },
        excludePeriodKeys: params.excludePeriodKeys ?? undefined,
        hamaliRate: effectiveHamaliRate,
      });
      return { expectedRentCharge: breakdown.totalRent, effectiveRates: { small: sRate, big: sRate } };
    }
    const billableMonths = calculateMonthlyElapsedCycles(grn.date, deliveryDate);
    const expectedRentCharge = calculateRentAmount({
      rentType: 'Monthly',
      bags: withdrawnTotal,
      bagCategory: params.bagCategory,
      bagPrice: mRate,
      rentMonths: billableMonths,
    });
    return { expectedRentCharge, effectiveRates: { small: mRate, big: mRate } };
  }

  const effectiveRates = resolveOutwardRates(grn.rentType, {
    smallBagPrice: grn.smallBagPrice,
    bigBagPrice: grn.bigBagPrice,
    bagPrice: grn.bagPrice,
  });

  if (isSeasonalEval || grn.rentType === 'Seasonal_3M') {
    const isMonthlyTransition = grn.rentType === 'Monthly';
    const hasNoAgreedRates = grn.smallBagPrice == null && grn.bigBagPrice == null && grn.bagPrice == null;
    const seasonalRateDoc = (hasNoAgreedRates || isMonthlyTransition)
      ? await CommodityRateModel.findOne({ commodityId: grn.commodityId, rentType: 'Seasonal', isActive: true }).session(session)
      : null;
    const needsMonthly = grn.rentType === 'Seasonal_3M'
      ? calculate3MAdditionalMonths(grn.date, deliveryDate) > 0
      : resolveSeasonalElapsedPeriods(grn.date, deliveryDate).some((p) => p.period !== 'SEASON');
    if ((hasNoAgreedRates || isMonthlyTransition) && !seasonalRateDoc) {
      throw new Error(`Cannot price outward delivery for GRN '${grn.grnNumber ?? grn.id}': no agreed rates and no active Seasonal controller rate`);
    }

    const seasonalRates = seasonalRateDoc ? { small: seasonalRateDoc.smallRate, big: seasonalRateDoc.bigRate } : effectiveRates;
    const monthlyRateDoc = await CommodityRateModel.findOne({ commodityId: grn.commodityId, rentType: 'Monthly', isActive: true }).session(session);
    if (needsMonthly && hasNoAgreedRates && !monthlyRateDoc) {
      throw new Error(`Cannot price outward delivery for GRN '${grn.grnNumber ?? grn.id}': January/February billing requires an active Monthly controller rate`);
    }

    const monthlyRates = isMonthlyTransition && !hasNoAgreedRates
      ? effectiveRates
      : monthlyRateDoc
      ? { small: monthlyRateDoc.smallRate, big: monthlyRateDoc.bigRate }
      : seasonalRates;

    if (grn.rentType === 'Seasonal_3M') {
      const extraMonths = calculate3MAdditionalMonths(grn.date, deliveryDate);
      const baseRent = calculateRentAmount({
        rentType: 'Seasonal_3M',
        bags: withdrawnTotal,
        bagType: 'S+B',
        smallBags: withdrawal.smallBags,
        bigBags: withdrawal.bigBags,
        smallBagPrice: seasonalRates.small,
        bigBagPrice: seasonalRates.big,
        rentMonths: 1,
      });
      const extraRent = extraMonths > 0 ? calculateRentAmount({
        rentType: 'Monthly',
        bags: withdrawnTotal,
        bagType: 'S+B',
        smallBags: withdrawal.smallBags,
        bigBags: withdrawal.bigBags,
        smallBagPrice: monthlyRates.small,
        bigBagPrice: monthlyRates.big,
        rentMonths: extraMonths,
      }) : 0;
      return { expectedRentCharge: baseRent + extraRent, effectiveRates: seasonalRates };
    }

    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate: grn.date,
      deliveryDate,
      smallBags: withdrawal.smallBags,
      bigBags: withdrawal.bigBags,
      seasonalRates,
      monthlyRates,
      excludePeriodKeys: params.excludePeriodKeys ?? undefined,
      hamaliRate: effectiveHamaliRate,
    });

    return { expectedRentCharge: breakdown.totalRent, effectiveRates: seasonalRates };
  }

  const hasAgreedRates = grn.smallBagPrice != null || grn.bigBagPrice != null || grn.bagPrice != null;
  const monthlyRateDoc = hasAgreedRates
    ? null
    : await CommodityRateModel.findOne({ commodityId: grn.commodityId, rentType: 'Monthly', isActive: true }).session(session);
  if (!hasAgreedRates && !monthlyRateDoc) {
    throw new Error(
      `Cannot price outward delivery for GRN '${grn.grnNumber ?? grn.id}': no agreed rates and no active Monthly controller rate`,
    );
  }

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
