import {
  chamberTextSchema, grnNumberInputSchema, indianVehicleSchema,
  INDIAN_VEHICLE_ERROR_MESSAGE, normalizeIndianVehicleNumber,
  type BagType, type Grn, type LoanStatus, type RentType,
} from '@cold-storage/contracts';

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
  createRentType: RentType;
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

  // Total-only inward; Small/Big/Hybrid composition is confirmed at outward delivery.
  if (typeof state.createBags !== 'number' || !Number.isInteger(state.createBags) || state.createBags < 1) {
    errors.bags = 'Total Bags is required (a positive whole number)';
  }

  const normVehicle = normalizeIndianVehicleNumber(state.createVehicleNumber);
  if (normVehicle && !indianVehicleSchema.safeParse(normVehicle).success) {
    errors.vehicleNumber = INDIAN_VEHICLE_ERROR_MESSAGE;
  }

  if (state.createPartyMark && state.createPartyMark.trim().length > 20) {
    errors.partyMark = 'Party mark cannot exceed 20 characters';
  }

  return { errors, parsedChamber: parsedChamber.success ? parsedChamber.data : undefined, normalizedVehicle: normVehicle };
}

export function buildCreateGrnPayload(params: {
  facilityId: string; inwardDate: Date; grnNumber: string; customerId: string; commodityId: string;
  chamber: string; bags: number; rentType: RentType;
  partyMark?: string; vehicleNumber?: string; remarks?: string;
  isBondForLoan?: boolean; loanStatus?: LoanStatus;
}): Record<string, unknown> {
  const p: Record<string, unknown> = {
    facilityId: params.facilityId, date: params.inwardDate,
    grnNumber: params.grnNumber, customerId: params.customerId,
    commodityId: params.commodityId, chamber: params.chamber, bags: params.bags,
    rentType: params.rentType,
  };
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
  createSmallBagPrice?: number | '';
  createBigBagPrice?: number | '';
  createTotalBagsWeight?: number | '';
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
    pushIf('rentMonths', typeof params.createRentMonths === 'number' ? params.createRentMonths : null, initialGrn.rentMonths ?? null);
    pushIf('rentAmount', typeof params.createRentAmount === 'number' ? params.createRentAmount : null, initialGrn.rentAmount ?? null);
    pushIf('bagPrice', typeof params.createBagPrice === 'number' ? params.createBagPrice : null, initialGrn.bagPrice ?? null);
    pushIf('smallBagPrice', typeof params.createSmallBagPrice === 'number' ? params.createSmallBagPrice : null, initialGrn.smallBagPrice ?? null);
    pushIf('bigBagPrice', typeof params.createBigBagPrice === 'number' ? params.createBigBagPrice : null, initialGrn.bigBagPrice ?? null);
    pushIf('totalBagsWeight', typeof params.createTotalBagsWeight === 'number' && params.createTotalBagsWeight > 0 ? params.createTotalBagsWeight : null, initialGrn.totalBagsWeight ?? null);
  }
  return { payload, hasChanges };
}

export const GRN_FIELD_ID_MAP: Record<string, string> = {
  customer: 'create-customer-search', commodity: 'create-commodity', chamber: 'create-chamber',
  partyMark: 'create-party-mark', bags: 'create-bags',
  grnNumber: 'create-gr-number', vehicleNumber: 'create-vehicle',
};

export function focusField(fieldId: string): void {
  const el = typeof document !== 'undefined' ? document.getElementById(fieldId) : null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.focus();
}
