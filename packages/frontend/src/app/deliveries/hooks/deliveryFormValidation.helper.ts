import { indianVehicleSchema, INDIAN_VEHICLE_ERROR_MESSAGE } from '@cold-storage/contracts';

export interface ValidateDeliveryFormInput {
  createGrnId: string;
  createDate: string;
  smallBags: number;
  bigBags: number;
  totalWithdrawingBags: number;
  availableSmall: number;
  availableBig: number;
  availableTotal?: number;
  isCombinedPool?: boolean;
  isHybrid?: boolean;
  bagPrice?: number | '';
  seasonalBagPrice?: number | '';
  monthlyBagPrice?: number | '';
  showSeasonalRate?: boolean;
  showMonthlyRate?: boolean;
  createVehicleNumber: string;
  createGpNumber?: string;
  createDriverName?: string;
  isLoanHoldActive: boolean;
  selectedGrnNumber?: string;
  selectedGrnDate?: Date | string | null;
}

export interface DeliveryFormValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  modalError: string | null;
}

export function validateDeliveryForm(input: ValidateDeliveryFormInput): DeliveryFormValidationResult {
  const errors: Record<string, string> = {};

  if (!input.createGrnId) {
    errors.grn = 'Please select an inward GRN to withdraw stock from';
  }

  if (input.isLoanHoldActive) {
    return {
      isValid: false,
      errors,
      modalError: `Outward blocked — Active loan hold against this Bond (${input.selectedGrnNumber ?? 'selected'}). Outward delivery is strictly prohibited until the loan is cleared.`,
    };
  }

  if (!input.createDate) {
    errors.date = 'Delivery date is required';
  } else {
    const d = new Date(input.createDate);
    const maxFuture = new Date(Date.now() + 5 * 60 * 1000);
    if (d > maxFuture) {
      errors.date = 'Delivery date cannot be in the future';
    } else if (input.selectedGrnDate) {
      const inDate = new Date(input.selectedGrnDate);
      if (!Number.isNaN(inDate.getTime()) && d.getTime() < inDate.getTime()) {
        errors.date = 'Delivery date cannot be earlier than Inward date';
      }
    }
  }

  const availableTotal = input.availableTotal ?? (input.availableSmall + input.availableBig);

  if (input.totalWithdrawingBags <= 0) {
    errors.bags = 'Please enter at least 1 bag to deliver';
  } else if (input.totalWithdrawingBags > availableTotal) {
    errors.bags = `Cannot deliver ${input.totalWithdrawingBags} bags (only ${availableTotal} available)`;
  }

  const isHybrid = Boolean(input.isHybrid);
  if (isHybrid) {
    const requiresDualRates = Boolean(input.showSeasonalRate || input.showMonthlyRate);
    if (requiresDualRates) {
      if (input.showSeasonalRate && (typeof input.seasonalBagPrice !== 'number' || input.seasonalBagPrice <= 0)) {
        errors.seasonalBagPrice = 'Please enter a valid seasonal rate per bag';
      }
      if (input.showMonthlyRate && (typeof input.monthlyBagPrice !== 'number' || input.monthlyBagPrice <= 0)) {
        errors.monthlyBagPrice = 'Please enter a valid monthly rate per bag';
      }
    } else if (typeof input.bagPrice !== 'number' || input.bagPrice <= 0) {
      errors.bagPrice = 'Please enter a valid price per bag';
    }
  } else {
    if (input.smallBags < 0 || !Number.isInteger(input.smallBags)) {
      errors.smallBags = 'Small bags must be a non-negative whole number';
    }
    if (input.bigBags < 0 || !Number.isInteger(input.bigBags)) {
      errors.bigBags = 'Big bags must be a non-negative whole number';
    }
    if (!input.isCombinedPool) {
      if (input.smallBags > input.availableSmall) {
        errors.smallBags = `Cannot deliver ${input.smallBags} small bags (only ${input.availableSmall} available)`;
      }
      if (input.bigBags > input.availableBig) {
        errors.bigBags = `Cannot deliver ${input.bigBags} big bags (only ${input.availableBig} available)`;
      }
    }
  }

  if (!input.createVehicleNumber?.trim()) {
    errors.vehicleNumber = 'Vehicle registration is required';
  } else if (!indianVehicleSchema.safeParse(input.createVehicleNumber.trim()).success) {
    errors.vehicleNumber = INDIAN_VEHICLE_ERROR_MESSAGE;
  }

  if (!input.createGpNumber?.trim()) {
    errors.gpNumber = 'Gate Pass number is required';
  }

  if (!input.createDriverName?.trim()) {
    errors.driverName = 'Driver name is required';
  }

  const isValid = Object.keys(errors).length === 0;
  const modalError = isValid ? null : Object.values(errors)[0];

  return { isValid, errors, modalError };
}
