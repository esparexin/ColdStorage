import type mongoose from 'mongoose';
import type { CreateDeliveryInput, RentType } from '@cold-storage/contracts';
import { computeExpectedDeliveryRent } from './delivery-rent.helper.js';

export interface ComputeDualSectionRentParams {
  facilityId: string;
  grn: {
    id: string;
    grnNumber?: string;
    date: Date;
    rentType: RentType;
    commodityId: string;
    smallBagPrice?: number | null;
    bigBagPrice?: number | null;
    bagPrice?: number | null;
  };
  deliveryDate: Date;
  input: CreateDeliveryInput;
  session: mongoose.ClientSession;
  excludePeriodKeys?: string[] | null;
}

export async function computeDualSectionRent(
  params: ComputeDualSectionRentParams,
): Promise<{ expectedRentCharge: number; unclassifiedRent: number; confirmedRent: number }> {
  const { grn, deliveryDate, input, session, excludePeriodKeys } = params;
  let unclassifiedRent = 0;
  let confirmedRent = 0;

  if (input.unclassifiedDispatch) {
    const u = input.unclassifiedDispatch;
    const isHybrid = u.bagType === 'Hybrid';
    const s = u.smallBags ?? 0;
    const b = u.bigBags ?? 0;
    const qty = isHybrid ? (u.quantity ?? s + b) : s + b;

    if (qty > 0) {
      const res = await computeExpectedDeliveryRent({
        grn,
        withdrawal: { smallBags: s, bigBags: b },
        quantity: isHybrid ? qty : undefined,
        deliveryDate,
        session,
        bagType: u.bagType,
        bagCategory: isHybrid ? 'Hybrid' : 'S/B',
        bagPrice: u.bagPrice,
        seasonalBagPrice: u.seasonalBagPrice,
        monthlyBagPrice: u.monthlyBagPrice,
        excludePeriodKeys,
      });
      unclassifiedRent = res.expectedRentCharge;
    }
  }

  if (input.confirmedDispatch) {
    const c = input.confirmedDispatch;
    const isHybrid = c.bagType === 'Hybrid';
    const s = c.smallBags ?? 0;
    const b = c.bigBags ?? 0;
    const qty = isHybrid ? (c.quantity ?? s + b) : s + b;

    if (qty > 0) {
      const res = await computeExpectedDeliveryRent({
        grn,
        withdrawal: { smallBags: s, bigBags: b },
        quantity: isHybrid ? qty : undefined,
        deliveryDate,
        session,
        bagType: c.bagType,
        bagCategory: isHybrid ? 'Hybrid' : 'S/B',
        bagPrice: c.bagPrice,
        seasonalBagPrice: c.seasonalBagPrice,
        monthlyBagPrice: c.monthlyBagPrice,
        excludePeriodKeys,
      });
      confirmedRent = res.expectedRentCharge;
    }
  }

  const expectedRentCharge = Number((unclassifiedRent + confirmedRent).toFixed(2));
  return {
    expectedRentCharge,
    unclassifiedRent,
    confirmedRent,
  };
}
