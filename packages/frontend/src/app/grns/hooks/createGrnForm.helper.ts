import {
  chamberTextSchema,
  indianVehicleSchema,
  rentalAmountSchema,
} from '@cold-storage/contracts';
import type { BagType, RentType } from '@cold-storage/contracts';

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
  createRentType: RentType;
  createRentMonths: number | '';
  createRentAmount: number | '';
  createVehicleNumber: string;
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

  if (state.createBagType === 'S+B') {
    const small = typeof state.createSmallBags === 'number' ? state.createSmallBags : 0;
    const big = typeof state.createBigBags === 'number' ? state.createBigBags : 0;
    if (small + big <= 0) errors.bags = 'Enter at least one bag count (Small or Big) for Mixed bag type';
  } else if (typeof state.createBags !== 'number' || state.createBags <= 0) {
    errors.bags = `${state.createBagType === 'S' ? 'Small' : 'Big'} bags count must be a positive integer`;
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

  return {
    errors,
    parsedChamber: parsedChamber.success ? parsedChamber.data : undefined,
    normalizedVehicle: normVehicle,
  };
}
