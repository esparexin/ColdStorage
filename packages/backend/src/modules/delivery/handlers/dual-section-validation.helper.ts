import type mongoose from 'mongoose';
import {
  parseMergedConsignmentBreakdown,
  type CreateDeliveryInput,
} from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';

export interface MergedStockPools {
  isMerged: boolean;
  initialUnclassified: number;
  initialConfirmedSmall: number;
  initialConfirmedBig: number;
  initialConfirmedHybrid: number;
  confirmedBagType: 'S/B' | 'Hybrid';
  availableUnclassified: number;
  availableConfirmedSmall: number;
  availableConfirmedBig: number;
  availableConfirmedHybrid: number;
  availableConfirmedTotal: number;
}

export async function resolveMergedStockPools(
  facilityId: string,
  grn: { id: string; bags: number; customerName: string; remarks?: string | null },
  session?: mongoose.ClientSession,
): Promise<MergedStockPools | null> {
  const breakdown = parseMergedConsignmentBreakdown(grn.remarks, grn.bags, grn.customerName);
  if (!breakdown || !breakdown.isMergedTarget || breakdown.totalMergedAddedBags <= 0) {
    return null;
  }

  const initialUnclassified = breakdown.genesisBags;
  const initialConfirmedSmall = breakdown.repackedSmallBags ?? 0;
  const initialConfirmedBig = breakdown.repackedBigBags ?? 0;
  const initialConfirmedHybrid = breakdown.repackedHybridBags ?? 0;
  const confirmedBagType: 'S/B' | 'Hybrid' = breakdown.repackedBagType ?? 'S/B';

  const priorChallans = await DeliveryChallanModel.find(
    { facilityId, grnId: grn.id, status: 'ISSUED' },
    null,
    session ? { session } : {},
  ).lean().exec();

  let priorUnclassified = 0;
  let priorConfirmedSmall = 0;
  let priorConfirmedBig = 0;
  let priorConfirmedHybrid = 0;

  for (const doc of priorChallans) {
    if (doc.unclassifiedDispatch) {
      const u = doc.unclassifiedDispatch;
      const uQty = u.quantity ?? ((u.smallBags ?? 0) + (u.bigBags ?? 0));
      priorUnclassified += uQty;
    }
    if (doc.confirmedDispatch) {
      const c = doc.confirmedDispatch;
      priorConfirmedSmall += c.smallBags ?? 0;
      priorConfirmedBig += c.bigBags ?? 0;
      priorConfirmedHybrid += c.quantity ?? ((c.smallBags ?? 0) + (c.bigBags ?? 0));
    }
  }

  const availableUnclassified = Math.max(0, initialUnclassified - priorUnclassified);
  const availableConfirmedSmall = Math.max(0, initialConfirmedSmall - priorConfirmedSmall);
  const availableConfirmedBig = Math.max(0, initialConfirmedBig - priorConfirmedBig);
  const availableConfirmedHybrid = Math.max(0, initialConfirmedHybrid - priorConfirmedHybrid);
  const availableConfirmedTotal =
    confirmedBagType === 'Hybrid'
      ? availableConfirmedHybrid
      : availableConfirmedSmall + availableConfirmedBig;

  return {
    isMerged: true,
    initialUnclassified,
    initialConfirmedSmall,
    initialConfirmedBig,
    initialConfirmedHybrid,
    confirmedBagType,
    availableUnclassified,
    availableConfirmedSmall,
    availableConfirmedBig,
    availableConfirmedHybrid,
    availableConfirmedTotal,
  };
}

export function validateDualSectionDispatch(
  input: CreateDeliveryInput,
  pools: MergedStockPools,
): { totalSmall: number; totalBig: number; totalWithdrawn: number; isHybridCombined: boolean } {
  const { unclassifiedDispatch: u, confirmedDispatch: c } = input;
  let uQty = 0;
  let uSmall = 0;
  let uBig = 0;
  let isUHybrid = false;

  if (u) {
    if (!u.bagType || (u.bagType !== 'S/B' && u.bagType !== 'Hybrid')) {
      throw new Error('Unclassified bags require an explicit bag type selection (S/B or Hybrid)');
    }
    isUHybrid = u.bagType === 'Hybrid';
    if (isUHybrid) {
      uQty = u.quantity ?? 0;
      if (uQty <= 0) {
        throw new Error('Hybrid unclassified outward delivery requires a positive quantity');
      }
    } else {
      uSmall = u.smallBags ?? 0;
      uBig = u.bigBags ?? 0;
      uQty = uSmall + uBig;
      if (uQty <= 0) {
        throw new Error('S/B unclassified outward delivery requires at least one small or big bag');
      }
    }
    if (uQty > pools.availableUnclassified) {
      throw new Error(
        `Requested ${uQty} unclassified bags exceeds remaining unclassified stock of ${pools.availableUnclassified} bags`,
      );
    }
  }

  let cQty = 0;
  let cSmall = 0;
  let cBig = 0;
  let isCHybrid = false;

  if (c) {
    isCHybrid = pools.confirmedBagType === 'Hybrid';
    if (isCHybrid) {
      cQty = c.quantity ?? 0;
      if (cQty <= 0) {
        throw new Error('Confirmed Hybrid outward delivery requires a positive quantity');
      }
      if (cQty > pools.availableConfirmedHybrid) {
        throw new Error(
          `Requested ${cQty} confirmed Hybrid bags exceeds remaining confirmed stock of ${pools.availableConfirmedHybrid} bags`,
        );
      }
    } else {
      cSmall = c.smallBags ?? 0;
      cBig = c.bigBags ?? 0;
      cQty = cSmall + cBig;
      if (cQty <= 0) {
        throw new Error('Confirmed S/B outward delivery requires at least one small or big bag');
      }
      if (cSmall > pools.availableConfirmedSmall) {
        throw new Error(
          `Requested ${cSmall} confirmed Small bags exceeds remaining confirmed stock of ${pools.availableConfirmedSmall} bags`,
        );
      }
      if (cBig > pools.availableConfirmedBig) {
        throw new Error(
          `Requested ${cBig} confirmed Big bags exceeds remaining confirmed stock of ${pools.availableConfirmedBig} bags`,
        );
      }
    }
  }

  const totalWithdrawn = uQty + cQty;
  if (totalWithdrawn <= 0) {
    throw new Error('Delivery must move at least one bag across Section A or Section B');
  }

  return {
    totalSmall: uSmall + cSmall,
    totalBig: uBig + cBig,
    totalWithdrawn,
    isHybridCombined: (u ? isUHybrid : true) && (c ? isCHybrid : true) && Boolean(u || c),
  };
}
