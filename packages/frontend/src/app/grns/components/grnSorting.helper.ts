import {
  calculateHamaliAmount,
  toOperationalBagType,
  type BagType,
  type OperationalBagType,
} from '@cold-storage/contracts';

export interface SortConfirmationFields {
  confirmedBagType: OperationalBagType;
  confirmedBags: number;
  totalBagsWeight?: number | null;
  paymentMode: 'Cash' | 'UPI';
  paymentNotes?: string;
}

export function validateSortConfirmation(
  fields: Partial<SortConfirmationFields>,
  existingBagType: BagType,
  availableBags: number,
): string | null {
  if (!fields.confirmedBagType) {
    return 'Please confirm the bag type.';
  }
  const expectedOperational = toOperationalBagType(existingBagType);
  if (fields.confirmedBagType !== expectedOperational) {
    return `Confirmed bag type (${fields.confirmedBagType}) does not match existing bag type (${existingBagType}).`;
  }
  if (fields.confirmedBags === undefined || fields.confirmedBags === null || isNaN(fields.confirmedBags)) {
    return 'Please enter the number of bags to confirm.';
  }
  if (!Number.isInteger(fields.confirmedBags) || fields.confirmedBags <= 0) {
    return 'Confirmed bags must be a positive whole number.';
  }
  if (fields.confirmedBags !== availableBags) {
    return `Confirmed bags (${fields.confirmedBags}) must match available stock (${availableBags}).`;
  }
  if (fields.totalBagsWeight !== undefined && fields.totalBagsWeight !== null) {
    if (isNaN(fields.totalBagsWeight) || fields.totalBagsWeight <= 0) {
      return 'Total weight must be a positive number if provided.';
    }
  }
  return null;
}

export interface RepackFields {
  resultingBagType: OperationalBagType;
  repackedSmallBags?: number | null;
  repackedBigBags?: number | null;
  repackedQuantity?: number | null;
  referenceWeight?: number | null;
  repackVarianceReason?: string;
  remarks: string;
}

export function validateRepackOperation(
  fields: Partial<RepackFields>,
  originalBags: number,
): string | null {
  if (!fields.resultingBagType) {
    return 'Please select the resulting bag type.';
  }
  const isHybrid = fields.resultingBagType === 'Hybrid';
  const totalRepacked = isHybrid
    ? (fields.repackedQuantity ?? 0)
    : (fields.repackedSmallBags ?? 0) + (fields.repackedBigBags ?? 0);

  if (totalRepacked <= 0) {
    return 'Repacked bag count must be greater than zero.';
  }

  if (!isHybrid) {
    if (fields.repackedSmallBags != null && fields.repackedSmallBags < 0) {
      return 'Repacked small bags cannot be negative.';
    }
    if (fields.repackedBigBags != null && fields.repackedBigBags < 0) {
      return 'Repacked big bags cannot be negative.';
    }
  }

  const variance = totalRepacked - originalBags;
  if (variance !== 0 && (!fields.repackVarianceReason || fields.repackVarianceReason.trim().length < 3)) {
    return 'Variance reason (minimum 3 characters) is required when repacked count differs from original bags.';
  }

  if (!fields.remarks || fields.remarks.trim().length < 3) {
    return 'Remarks (minimum 3 characters) are required for the repacking audit record.';
  }

  return null;
}

export function computeHamaliCharge(bags: number, rate?: number | null): number {
  return calculateHamaliAmount(bags, rate);
}
