import type mongoose from 'mongoose';
import {
  isHybridBagCategory,
  parseMergedConsignmentBreakdown,
  type BagComposition,
  type CreateDeliveryInput,
  type RentType,
} from '@cold-storage/contracts';
import { readLedgerBalance, type LedgerBalance } from '../../inventory/ledger-balance.js';
import { validateStockAndBalances } from './delivery-validation.helper.js';
import { computeExpectedDeliveryRent } from './delivery-rent.helper.js';
import { resolveMergedStockPools, validateDualSectionDispatch } from './dual-section-validation.helper.js';
import { computeDualSectionRent } from './dual-section-rent.helper.js';

export interface DeliveryPlanResult {
  isHybrid: boolean;
  finalSmall: number;
  finalBig: number;
  withdrawnTotal: number;
  expectedRentCharge: number;
  available: LedgerBalance;
  hasUnclassifiedGenesis?: boolean;
}

export async function resolveDeliveryPlan(params: {
  facilityId: string;
  grn: {
    id: string;
    grnNumber: string;
    date: Date;
    rentType: RentType;
    commodityId: string;
    bagType?: string | null;
    isCompositionVerified?: boolean | null;
    smallBagPrice?: number | null;
    bigBagPrice?: number | null;
    bagPrice?: number | null;
    bags: number;
    customerName: string;
    remarks?: string | null;
  };
  input: CreateDeliveryInput;
  deliveryDate: Date;
  session: mongoose.ClientSession;
  billedPeriods: string[];
}): Promise<DeliveryPlanResult> {
  const { facilityId, grn, input, deliveryDate, session, billedPeriods } = params;
  const breakdown = parseMergedConsignmentBreakdown(grn.remarks, grn.bags, grn.customerName);
  const hasUnclassifiedGenesis =
    Boolean(breakdown?.genesisBags && breakdown.genesisBags > 0) || !grn.isCompositionVerified;

  // Dual-section dispatch for merged consignments (Section A unclassified + Section B confirmed repacked)
  if (input.unclassifiedDispatch || input.confirmedDispatch) {
    const pools = await resolveMergedStockPools(facilityId, grn, session);
    if (!pools) {
      throw new Error(
        `GRN '${grn.grnNumber}' is not a merged consignment and does not support dual-section dispatch`,
      );
    }
    const dualVal = validateDualSectionDispatch(input, pools);
    const available = await readLedgerBalance(facilityId, grn.id, session);
    if (dualVal.totalWithdrawn > available.total) {
      throw new Error(
        `Requested ${dualVal.totalWithdrawn} bags exceeds available balance of ${available.total} bags for GRN '${grn.grnNumber}'`,
      );
    }
    const rentRes = await computeDualSectionRent({
      facilityId,
      grn,
      deliveryDate,
      input,
      session,
      excludePeriodKeys: billedPeriods,
    });

    return {
      isHybrid: dualVal.isHybridCombined,
      finalSmall: dualVal.totalSmall,
      finalBig: dualVal.totalBig,
      withdrawnTotal: dualVal.totalWithdrawn,
      expectedRentCharge: rentRes.expectedRentCharge,
      available,
      hasUnclassifiedGenesis,
    };
  }

  // Standard single-lot delivery path
  const isHybrid =
    input.bagType === 'Hybrid' ||
    grn.bagType === 'Hybrid' ||
    isHybridBagCategory(input.bagCategory);
  const hasSpecificBags = (input.smallBags ?? 0) > 0 || (input.bigBags ?? 0) > 0;
  const sRate = grn.smallBagPrice ?? grn.bagPrice ?? 0;
  const bRate = grn.bigBagPrice ?? grn.bagPrice ?? 0;
  const hasDiffRates =
    (grn.smallBagPrice != null || grn.bigBagPrice != null) && sRate !== bRate;

  if (!isHybrid && (grn.bagType === 'S/B' || grn.bagType === 'S+B' || !grn.isCompositionVerified)) {
    if (hasDiffRates && !hasSpecificBags) {
      throw new Error(
        'Small and big bag composition required for delivery when storage rates differ',
      );
    }
    if (!grn.isCompositionVerified && !hasSpecificBags) {
      throw new Error(
        'Confirmed bag composition is required before generating outward delivery challan',
      );
    }
  }

  const reqQty = input.quantity ?? 0;
  if (!isHybrid && hasSpecificBags && reqQty > 0 && (input.smallBags ?? 0) + (input.bigBags ?? 0) !== reqQty) {
    throw new Error(
      `Small (${input.smallBags ?? 0}) and big (${input.bigBags ?? 0}) bags must equal requested quantity (${reqQty})`,
    );
  }

  const available = await readLedgerBalance(facilityId, grn.id, session);

  let resSmall = 0;
  let resBig = 0;
  if (hasSpecificBags) {
    resSmall = input.smallBags ?? 0;
    resBig = input.bigBags ?? 0;
  } else if (!isHybrid) {
    if (grn.bagType === 'B' || (available.smallBags === 0 && available.bigBags > 0)) {
      resSmall = 0;
      resBig = reqQty;
    } else if (grn.bagType === 'S' || (available.bigBags === 0 && available.smallBags > 0)) {
      resSmall = reqQty;
      resBig = 0;
    } else if (available.smallBags > 0 && available.bigBags > 0) {
      if (grn.bagType === 'S/B' || grn.bagType === 'S+B') {
        throw new Error(
          'Small and big bag composition required for delivery when both bag types are in stock',
        );
      }
      resSmall = reqQty;
      resBig = 0;
    } else {
      resSmall = reqQty;
      resBig = 0;
    }
  }

  const withdrawal: BagComposition = {
    smallBags: isHybrid && !hasSpecificBags ? 0 : resSmall,
    bigBags: isHybrid && !hasSpecificBags ? 0 : resBig,
  };

  await validateStockAndBalances(
    facilityId,
    grn,
    withdrawal,
    session,
    isHybrid,
    reqQty,
    hasSpecificBags,
    available,
  );
  const finalSmall = withdrawal.smallBags;
  const finalBig = withdrawal.bigBags;
  const withdrawnTotal = isHybrid && !hasSpecificBags ? reqQty : finalSmall + finalBig;

  const { expectedRentCharge } = await computeExpectedDeliveryRent({
    grn,
    withdrawal,
    deliveryDate,
    session,
    excludePeriodKeys: billedPeriods,
    quantity: isHybrid && !hasSpecificBags ? reqQty : undefined,
    bagType: isHybrid ? 'Hybrid' : (input.bagType ?? grn.bagType),
    bagCategory: input.bagCategory,
    bagPrice: input.bagPrice,
    seasonalBagPrice: input.seasonalBagPrice,
    monthlyBagPrice: input.monthlyBagPrice,
  });

  return {
    isHybrid,
    finalSmall,
    finalBig,
    withdrawnTotal,
    expectedRentCharge,
    available,
    hasUnclassifiedGenesis,
  };
}
