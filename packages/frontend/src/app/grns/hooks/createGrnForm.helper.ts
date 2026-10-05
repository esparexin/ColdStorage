import {
  bagCompositionIssue,
  chamberTextSchema,
  indianVehicleSchema,
  rentalAmountSchema,
} from '@cold-storage/contracts';
import type { BagType, LoanStatus, RentType } from '@cold-storage/contracts';

export function parseNumericInput(raw: string): number | '' {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') return '';
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : '';
}

export interface CreateGrnState {
  createCustomerId: string;
  createCommodityId: string;
  createChamber: string;
  createBags: number | '';
  createBagType: BagType;
  createSmallBags: number | '';
  createBigBags: number | '';
  createSmallBagWeight: number | '';
  createBigBagWeight: number | '';
  createRentType: RentType;
  createRentMonths: number | '';
  createRentAmount: number | '';
  createStorageMark?: string;
  createPartyMark?: string;
  createBillNumber?: string;
  createVehicleNumber: string;
  isBondForLoan?: boolean;
  loanStatus?: LoanStatus;
  loanBankName?: string;
  loanReferenceNumber?: string;
  loanRemarks?: string;
}

export function validateCreateGrnForm(state: CreateGrnState): {
  errors: Record<string, string>;
  parsedChamber?: string;
  normalizedVehicle?: string;
} {
  const errors: Record<string, string> = {};
  if (!state.createCustomerId) errors.customer = 'Please select a customer';
  if (!state.createCommodityId) errors.commodity = 'Please select a commodity';

  const parsedChamber = chamberTextSchema.safeParse(state.createChamber);
  if (!parsedChamber.success) {
    errors.chamber = parsedChamber.error.issues[0]?.message ?? 'Chamber is required';
  }

  // The same composition rule the server enforces, so the form cannot submit a receipt the
  // create-GRN contract would reject with a different message.
  const compositionError = bagCompositionIssue({
    bagType: state.createBagType,
    bags:
      state.createBagType === 'S+B'
        ? (typeof state.createSmallBags === 'number' ? state.createSmallBags : 0) +
          (typeof state.createBigBags === 'number' ? state.createBigBags : 0)
        : typeof state.createBags === 'number'
          ? state.createBags
          : 0,
    smallBags: typeof state.createSmallBags === 'number' ? state.createSmallBags : null,
    bigBags: typeof state.createBigBags === 'number' ? state.createBigBags : null,
  });
  if (compositionError) {
    errors.bags = compositionError;
  }

  // Per-bag weight only: S requires Small, B requires Big, S+B requires both.
  if (state.createBagType === 'S' || state.createBagType === 'S+B') {
    if (typeof state.createSmallBagWeight !== 'number' || state.createSmallBagWeight <= 0) {
      errors.smallBagWeight = 'Small Bag Weight (kg per bag) is required';
    }
  }
  if (state.createBagType === 'B' || state.createBagType === 'S+B') {
    if (typeof state.createBigBagWeight !== 'number' || state.createBigBagWeight <= 0) {
      errors.bigBagWeight = 'Big Bag Weight (kg per bag) is required';
    }
  }

  if (state.createRentType === 'Monthly' && (typeof state.createRentMonths !== 'number' || state.createRentMonths < 1)) {
    errors.rentMonths = 'Rent months is required (>= 1) for Monthly rent';
  }

  const parsedAmount = rentalAmountSchema.safeParse(state.createRentAmount);
  if (!parsedAmount.success) {
    errors.rentAmount = parsedAmount.error.issues[0]?.message ?? 'Rent amount must be a number';
  }

  const normVehicle = state.createVehicleNumber.trim().replace(/[\s-]/g, '').toUpperCase();
  if (normVehicle && !indianVehicleSchema.safeParse(normVehicle).success) {
    errors.vehicleNumber = 'Vehicle number must be in standard Indian format (e.g., UP32AA1111)';
  }

  if (state.createStorageMark && state.createStorageMark.trim().length > 20) {
    errors.storageMark = 'Storage mark cannot exceed 20 characters';
  }
  if (state.createPartyMark && state.createPartyMark.trim().length > 20) {
    errors.partyMark = 'Party mark cannot exceed 20 characters';
  }
  if (state.createBillNumber && state.createBillNumber.trim().length > 40) {
    errors.billNumber = 'Bill number cannot exceed 40 characters';
  }

  return {
    errors,
    parsedChamber: parsedChamber.success ? parsedChamber.data : undefined,
    normalizedVehicle: normVehicle,
  };
}

export function buildCreateGrnPayload(params: {
  facilityId: string; inwardDate: Date; customerId: string; commodityId: string;
  chamber: string; bags: number; bagType: BagType; rentType: RentType; rentAmount: number;
  bagPrice?: number | ''; smallBagPrice?: number | ''; bigBagPrice?: number | '';
  smallBags?: number | ''; bigBags?: number | ''; rentMonths?: number | '';
  smallBagWeight?: number | ''; bigBagWeight?: number | '';
  gpNumber?: string; storageMark?: string; partyMark?: string; billNumber?: string;
  vehicleNumber?: string; remarks?: string;
  isBondForLoan?: boolean; loanStatus?: LoanStatus; loanBankName?: string;
  loanReferenceNumber?: string; loanRemarks?: string;
}): Record<string, unknown> {
  const p: Record<string, unknown> = {
    facilityId: params.facilityId, date: params.inwardDate, customerId: params.customerId,
    commodityId: params.commodityId, chamber: params.chamber, bags: params.bags,
    bagType: params.bagType, rentType: params.rentType, rentAmount: params.rentAmount,
  };
  if (typeof params.bagPrice === 'number' && params.bagPrice > 0) p.bagPrice = params.bagPrice;
  if (typeof params.smallBagPrice === 'number' && params.smallBagPrice > 0) p.smallBagPrice = params.smallBagPrice;
  if (typeof params.bigBagPrice === 'number' && params.bigBagPrice > 0) p.bigBagPrice = params.bigBagPrice;
  if (typeof params.smallBags === 'number' && params.smallBags > 0) p.smallBags = params.smallBags;
  if (typeof params.bigBags === 'number' && params.bigBags > 0) p.bigBags = params.bigBags;
  if (params.rentType === 'Monthly' && typeof params.rentMonths === 'number') p.rentMonths = params.rentMonths;
  if (typeof params.smallBagWeight === 'number' && params.smallBagWeight > 0) p.smallBagWeight = params.smallBagWeight;
  if (typeof params.bigBagWeight === 'number' && params.bigBagWeight > 0) p.bigBagWeight = params.bigBagWeight;
  if (params.gpNumber?.trim()) p.gpNumber = params.gpNumber.trim();
  if (params.storageMark?.trim()) p.storageMark = params.storageMark.trim();
  if (params.partyMark?.trim()) p.partyMark = params.partyMark.trim();
  if (params.billNumber?.trim()) p.billNumber = params.billNumber.trim();
  if (params.vehicleNumber) p.vehicleNumber = params.vehicleNumber;
  if (params.remarks?.trim()) p.remarks = params.remarks.trim();
  if (params.isBondForLoan) {
    p.isBondForLoan = true;
    p.loanStatus = params.loanStatus || 'NOT_TAKEN';
    if (params.loanBankName?.trim()) p.loanBankName = params.loanBankName.trim();
    if (params.loanReferenceNumber?.trim()) p.loanReferenceNumber = params.loanReferenceNumber.trim();
    if (params.loanRemarks?.trim()) p.loanRemarks = params.loanRemarks.trim();
  }
  return p;
}
