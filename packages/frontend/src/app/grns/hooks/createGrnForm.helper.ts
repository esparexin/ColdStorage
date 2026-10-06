import {
  chamberTextSchema,
  grnNumberInputSchema,
  indianVehicleSchema,
  rentalAmountSchema,
} from '@cold-storage/contracts';
import type { BagType, Grn, LoanStatus, RentType } from '@cold-storage/contracts';

export function parseNumericInput(raw: string): number | '' {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') return '';
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : '';
}

export interface CreateGrnState {
  createGrnNumber: string;
  createCustomerId: string;
  createCommodityId: string;
  createChamber: string;
  createBags: number | '';
  createBagType: BagType;
  createRentType: RentType;
  createRentMonths: number | '';
  createRentAmount: number | '';
  createBagPrice: number | '';
  createPartyMark?: string;
  createVehicleNumber: string;
}

export function validateCreateGrnForm(state: CreateGrnState): {
  errors: Record<string, string>;
  parsedChamber?: string;
  normalizedVehicle?: string;
} {
  const errors: Record<string, string> = {};

  // Same rule the server enforces, so the form cannot submit a GR Number the contract rejects.
  const parsedGrnNumber = grnNumberInputSchema.safeParse(state.createGrnNumber.trim());
  if (!parsedGrnNumber.success) {
    errors.grnNumber = 'GRN must be exactly 4 digits (numbers only)';
  }

  if (!state.createCustomerId) errors.customer = 'Please select a customer';
  if (!state.createCommodityId) errors.commodity = 'Please select a commodity';

  const parsedChamber = chamberTextSchema.safeParse(state.createChamber);
  if (!parsedChamber.success) {
    errors.chamber = parsedChamber.error.issues[0]?.message ?? 'Chamber is required';
  }

  // Total Bags is a manual numbers-only input. Bag type is Small-only or
  // Big-only, so the split is derived server-side and no composition check applies.
  if (typeof state.createBags !== 'number' || !Number.isInteger(state.createBags) || state.createBags < 1) {
    errors.bags = 'Total Bags is required (a positive whole number)';
  }

  if (state.createRentType === 'Monthly' && typeof state.createRentMonths === 'number' && state.createRentMonths < 1) {
    errors.rentMonths = 'Rent months must be >= 1 when provided';
  }

  if (state.createRentType === 'Seasonal' || (state.createRentAmount !== '' && state.createRentAmount !== undefined)) {
    const parsedAmount = rentalAmountSchema.safeParse(state.createRentAmount);
    if (!parsedAmount.success) {
      errors.rentAmount = parsedAmount.error.issues[0]?.message ?? 'Rent amount must be a number';
    }
  }

  const normVehicle = state.createVehicleNumber.trim().replace(/[\s-]/g, '').toUpperCase();
  if (normVehicle && !indianVehicleSchema.safeParse(normVehicle).success) {
    errors.vehicleNumber = 'Vehicle number must be in standard Indian format (e.g., UP32AA1111)';
  }

  if (state.createPartyMark && state.createPartyMark.trim().length > 20) {
    errors.partyMark = 'Party mark cannot exceed 20 characters';
  }

  return {
    errors,
    parsedChamber: parsedChamber.success ? parsedChamber.data : undefined,
    normalizedVehicle: normVehicle,
  };
}

export function buildCreateGrnPayload(params: {
  facilityId: string; inwardDate: Date; grnNumber: string; customerId: string; commodityId: string;
  chamber: string; bags: number; bagType: BagType; rentType: RentType;
  rentAmount?: number | '';
  bagPrice?: number | '';
  rentMonths?: number | '';
  partyMark?: string;
  vehicleNumber?: string; remarks?: string;
  isBondForLoan?: boolean; loanStatus?: LoanStatus;
}): Record<string, unknown> {
  const p: Record<string, unknown> = {
    facilityId: params.facilityId, date: params.inwardDate,
    grnNumber: params.grnNumber, customerId: params.customerId,
    commodityId: params.commodityId, chamber: params.chamber, bags: params.bags,
    bagType: params.bagType, rentType: params.rentType,
  };
  if (typeof params.rentAmount === 'number') p.rentAmount = params.rentAmount;
  if (typeof params.bagPrice === 'number' && params.bagPrice > 0) p.bagPrice = params.bagPrice;
  if (params.rentType === 'Monthly' && typeof params.rentMonths === 'number') p.rentMonths = params.rentMonths;
  if (params.partyMark?.trim()) p.partyMark = params.partyMark.trim();
  if (params.vehicleNumber) p.vehicleNumber = params.vehicleNumber;
  if (params.remarks?.trim()) p.remarks = params.remarks.trim();
  if (params.isBondForLoan) {
    p.isBondForLoan = true;
    p.loanStatus = params.loanStatus || 'NOT_TAKEN';
  }
  return p;
}

export function toDateInput(d?: Date | string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().split('T')[0];
}

export function buildEditGrnPayload(params: {
  initialGrn: Grn;
  structuralLocked: boolean;
  createCustomerId: string;
  createDate: string;
  createCommodityId: string;
  createChamber: string;
  createBags: number | '';
  createBagType: BagType;
  createRentType: RentType;
  createRentMonths: number | '';
  createRentAmount: number | '';
  createBagPrice: number | '';
  createPartyMark?: string;
  createVehicleNumber?: string;
  createRemarks?: string;
  reason?: string;
}): { payload: Record<string, unknown>; hasChanges: boolean } {
  const { initialGrn, structuralLocked } = params;
  const payload: Record<string, unknown> = {
    reason: params.reason?.trim() || 'Inward details updated via Inward edit',
  };
  let hasChanges = false;
  const pushIf = (k: string, next: unknown, prev: unknown) => {
    if (JSON.stringify(next) !== JSON.stringify(prev)) {
      payload[k] = next;
      hasChanges = true;
    }
  };
  const chamber = params.createChamber.trim();
  if (chamber && chamber !== initialGrn.chamber) {
    payload.chamber = chamber;
    hasChanges = true;
  }
  pushIf('partyMark', params.createPartyMark?.trim() || null, initialGrn.partyMark ?? null);
  pushIf(
    'vehicleNumber',
    params.createVehicleNumber?.trim().replace(/[\s-]/g, '').toUpperCase() || null,
    initialGrn.vehicleNumber ?? null,
  );
  pushIf('remarks', params.createRemarks?.trim() || null, initialGrn.remarks ?? null);

  if (!structuralLocked) {
    if (params.createCustomerId && params.createCustomerId !== initialGrn.customerId) {
      pushIf('customerId', params.createCustomerId, initialGrn.customerId);
    }
    const dStr = toDateInput(initialGrn.date);
    if (params.createDate && params.createDate !== dStr) {
      pushIf('date', new Date(`${params.createDate}T00:00:00`).toISOString(), initialGrn.date);
    }
    if (params.createCommodityId && params.createCommodityId !== initialGrn.commodityId) {
      pushIf('commodityId', params.createCommodityId, initialGrn.commodityId);
    }
    if (params.createBagType !== initialGrn.bagType) {
      pushIf('bagType', params.createBagType, initialGrn.bagType);
    }
    if (typeof params.createBags === 'number' && params.createBags !== initialGrn.bags) {
      pushIf('bags', params.createBags, initialGrn.bags);
    }
    if (params.createRentType !== initialGrn.rentType) {
      pushIf('rentType', params.createRentType, initialGrn.rentType);
    }
    pushIf(
      'rentMonths',
      typeof params.createRentMonths === 'number' ? params.createRentMonths : null,
      initialGrn.rentMonths ?? null,
    );
    pushIf(
      'rentAmount',
      typeof params.createRentAmount === 'number' ? params.createRentAmount : null,
      initialGrn.rentAmount ?? null,
    );
    pushIf(
      'bagPrice',
      typeof params.createBagPrice === 'number' ? params.createBagPrice : null,
      initialGrn.bagPrice ?? null,
    );
  }
  return { payload, hasChanges };
}

export const GRN_FIELD_ID_MAP: Record<string, string> = {
  customer: 'create-customer-search',
  commodity: 'create-commodity',
  chamber: 'create-chamber',
  partyMark: 'create-party-mark',
  bags: 'create-bags',
  grnNumber: 'create-gr-number',
  rentMonths: 'create-rent-months',
  rentAmount: 'create-rent-amount',
  vehicleNumber: 'create-vehicle',
};

export function focusField(fieldId: string): void {
  const el = typeof document !== 'undefined' ? document.getElementById(fieldId) : null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.focus();
}
