import { indianVehicleSchema } from '@cold-storage/contracts';

export interface ValidateDeliveryFormInput {
  createGrnId: string;
  createDate: string;
  smallBags: number;
  bigBags: number;
  totalWithdrawingBags: number;
  availableSmall: number;
  availableBig: number;
  createVehicleNumber: string;
  isLoanHoldActive: boolean;
  selectedGrnNumber?: string;
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
    }
  }

  if (input.totalWithdrawingBags <= 0) {
    errors.bags = 'Please enter at least 1 bag (small or big) to deliver';
  }

  if (input.smallBags > input.availableSmall) {
    errors.smallBags = `Cannot deliver ${input.smallBags} small bags (only ${input.availableSmall} available)`;
  }

  if (input.bigBags > input.availableBig) {
    errors.bigBags = `Cannot deliver ${input.bigBags} big bags (only ${input.availableBig} available)`;
  }

  if (input.createVehicleNumber.trim()) {
    if (!indianVehicleSchema.safeParse(input.createVehicleNumber.trim()).success) {
      errors.vehicleNumber = 'Vehicle registration must be in standard Indian format (e.g. UP32AA1111)';
    }
  }

  const isValid = Object.keys(errors).length === 0;
  const modalError = isValid ? null : Object.values(errors)[0];

  return { isValid, errors, modalError };
}
