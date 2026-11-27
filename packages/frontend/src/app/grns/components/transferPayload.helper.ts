import type { BagType, OutwardBagCategory, PaymentMode, TransferPaymentDecision, TransferSettlementDetails } from '@cold-storage/contracts';

export interface TransferPayload {
  grnId: string;
  newCustomerId: string;
  movementDate: string;
  remarks: string;
  paymentDecision?: TransferPaymentDecision;
  settlementDetails?: TransferSettlementDetails;
  confirmedSmallBags?: number;
  confirmedBigBags?: number;
  sourceBagType?: BagType;
  sourceBagCategory?: OutwardBagCategory | BagType;
  sourceQuantity?: number;
  sourceBagPrice?: number;
  sourceSeasonalBagPrice?: number;
  sourceMonthlyBagPrice?: number;
  destinationChamber?: string;
  partyMark?: string;
  resultingBagType?: BagType;
  repackedSmallBags?: number;
  repackedBigBags?: number;
  repackedQuantity?: number;
  referenceWeight?: number;
  transferFeePerBag?: number;
  totalTransferFee?: number;
  feePaymentMode?: PaymentMode;
  feePaidBy?: 'BUYER' | 'SELLER';
}

function composeTransferRemarks(reason: string, remarks?: string): string {
  const parts: string[] = [];
  if (reason && reason.trim()) parts.push(reason.trim());
  if (remarks && remarks.trim()) parts.push(remarks.trim());
  return parts.join(' — ') || 'Internal Movement';
}

export function buildTransferPayload(
  grnId: string,
  newCustomerId: string,
  reason: string,
  remarks?: string,
  movementDate?: string,
  paymentDecision?: TransferPaymentDecision,
  settlementDetails?: TransferSettlementDetails,
  confirmation?: {
    confirmedSmallBags?: number;
    confirmedBigBags?: number;
    sourceBagCategory?: OutwardBagCategory | BagType;
    sourceQuantity?: number;
    sourceBagPrice?: number;
    sourceSeasonalBagPrice?: number;
    sourceMonthlyBagPrice?: number;
  },
  repack?: {
    destinationChamber?: string;
    resultingBagType?: BagType;
    repackedSmallBags?: number;
    repackedBigBags?: number;
    repackedQuantity?: number;
    referenceWeight?: number;
    partyMark?: string;
  },
  fee?: {
    transferFeePerBag?: number;
    totalTransferFee?: number;
    feePaymentMode?: PaymentMode;
    feePaidBy?: 'BUYER' | 'SELLER';
  },
): TransferPayload {
  return {
    grnId,
    newCustomerId,
    movementDate: movementDate || new Date().toISOString(),
    remarks: composeTransferRemarks(reason, remarks),
    paymentDecision: paymentDecision || 'AGREED_PENDING',
    settlementDetails,
    confirmedSmallBags: confirmation?.confirmedSmallBags,
    confirmedBigBags: confirmation?.confirmedBigBags,
    sourceBagCategory: confirmation?.sourceBagCategory,
    sourceQuantity: confirmation?.sourceQuantity,
    sourceBagPrice: confirmation?.sourceBagPrice,
    sourceSeasonalBagPrice: confirmation?.sourceSeasonalBagPrice,
    sourceMonthlyBagPrice: confirmation?.sourceMonthlyBagPrice,
    destinationChamber: repack?.destinationChamber,
    partyMark: repack?.partyMark?.trim() || undefined,
    resultingBagType: repack?.resultingBagType,
    repackedSmallBags: repack?.repackedSmallBags,
    repackedBigBags: repack?.repackedBigBags,
    repackedQuantity: repack?.repackedQuantity,
    referenceWeight: repack?.referenceWeight,
    transferFeePerBag: fee?.transferFeePerBag,
    totalTransferFee: fee?.totalTransferFee,
    feePaymentMode: fee?.feePaymentMode,
    feePaidBy: fee?.feePaidBy,
  };
}

export function buildTransferExecutionArgs(params: {
  isHybrid: boolean;
  sourceBagCategory?: OutwardBagCategory;
  remainingBags: number;
  sourceBagPrice?: number | '';
  sourceSeasonalBagPrice?: number | '';
  sourceMonthlyBagPrice?: number | '';
  confirmedSmallBags?: number | '';
  confirmedBigBags?: number | '';
  destinationChamber: string;
  resultingBagType: BagType;
  repackedSmallBags?: number | '';
  repackedBigBags?: number | '';
  repackedQuantity?: number | '';
  referenceWeight?: number | '';
  partyMark: string;
  transferFeePerBag?: number | '';
  transferFeeCharged: number;
  paymentMode: PaymentMode;
  feePaidBy?: 'BUYER' | 'SELLER';
}) {
  const conf = params.isHybrid ? {
    sourceBagCategory: params.sourceBagCategory || undefined,
    sourceQuantity: params.remainingBags,
    sourceBagPrice: typeof params.sourceBagPrice === 'number' ? params.sourceBagPrice : undefined,
    sourceSeasonalBagPrice: typeof params.sourceSeasonalBagPrice === 'number' ? params.sourceSeasonalBagPrice : undefined,
    sourceMonthlyBagPrice: typeof params.sourceMonthlyBagPrice === 'number' ? params.sourceMonthlyBagPrice : undefined,
  } : typeof params.confirmedSmallBags === 'number' && typeof params.confirmedBigBags === 'number'
    ? { confirmedSmallBags: params.confirmedSmallBags, confirmedBigBags: params.confirmedBigBags } : undefined;

  const repack = {
    destinationChamber: params.destinationChamber.trim(),
    resultingBagType: params.resultingBagType,
    repackedSmallBags: params.resultingBagType === 'Hybrid' ? undefined : (typeof params.repackedSmallBags === 'number' ? params.repackedSmallBags : undefined),
    repackedBigBags: params.resultingBagType === 'Hybrid' ? undefined : (typeof params.repackedBigBags === 'number' ? params.repackedBigBags : undefined),
    repackedQuantity: params.resultingBagType === 'Hybrid' ? (typeof params.repackedQuantity === 'number' ? params.repackedQuantity : undefined) : undefined,
    referenceWeight: typeof params.referenceWeight === 'number' && params.referenceWeight > 0 ? params.referenceWeight : undefined,
    partyMark: params.partyMark.trim() || undefined,
  };

  const fee = typeof params.transferFeePerBag === 'number' && params.transferFeePerBag > 0 ? {
    transferFeePerBag: params.transferFeePerBag,
    totalTransferFee: params.transferFeeCharged,
    feePaymentMode: params.paymentMode,
    feePaidBy: params.feePaidBy,
  } : undefined;

  return { conf, repack, fee };
}

export function validateTransferPayment(
  decision: string,
  amount: number,
  pending: number,
): string | null {
  if (pending <= 0 || decision === 'AGREED_PENDING') {
    return null;
  }
  if (decision !== 'SETTLE_NOW') {
    return 'Invalid payment decision.';
  }
  if (amount <= 0) {
    return 'Payment amount must be greater than zero.';
  }
  if (amount < pending) {
    return `Outstanding rent must be settled in full (₹${pending.toLocaleString('en-IN')}) before ownership transfer under SETTLE_NOW, or choose AGREED_PENDING to carry forward.`;
  }
  if (amount > pending) {
    return `Payment cannot exceed pending balance of ₹${pending.toLocaleString('en-IN')}.`;
  }
  return null;
}
