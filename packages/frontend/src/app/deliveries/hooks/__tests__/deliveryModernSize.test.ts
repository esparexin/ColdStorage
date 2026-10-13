import { describe, expect, it } from 'vitest';
import {
  computeOutwardRentCharge,
  formatOutwardRentFormula,
} from '../deliveryRent.helper';
import {
  validateDeliveryForm,
  type ValidateDeliveryFormInput,
} from '../deliveryFormValidation.helper';

describe('deliveryModernSize outward flow', () => {
  describe('computeOutwardRentCharge with Modern Size', () => {
    it('calculates seasonal rent for Modern Size as quantity * manual price', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Modern Size',
        quantity: 100,
        manualBagPrice: 65,
      });
      expect(rent).toBe(6500);
    });

    it('calculates monthly rent for Modern Size taking rentMonths into account', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Monthly',
        bagCategory: 'Modern Size',
        quantity: 50,
        manualBagPrice: 20,
        rentMonths: 3,
      });
      expect(rent).toBe(3000);
    });

    it('returns 0 when quantity is 0 or manualBagPrice is not provided', () => {
      expect(
        computeOutwardRentCharge({
          rentType: 'Seasonal',
          bagCategory: 'Modern Size',
          quantity: 0,
          manualBagPrice: 65,
        }),
      ).toBe(0);

      expect(
        computeOutwardRentCharge({
          rentType: 'Seasonal',
          bagCategory: 'Modern Size',
          quantity: 100,
        }),
      ).toBe(0);
    });
  });

  describe('formatOutwardRentFormula with Modern Size', () => {
    it('formats single season formula cleanly', () => {
      const formula = formatOutwardRentFormula(
        'Seasonal',
        'Modern Size',
        10,
        0,
        50,
        50,
      );
      expect(formula).toBe('10 Modern Size bags × ₹50/bag × season total');
    });

    it('formats monthly formula with months count', () => {
      const formula = formatOutwardRentFormula(
        'Monthly',
        'Modern Size',
        20,
        0,
        15,
        15,
        2,
      );
      expect(formula).toBe('20 Modern Size bags × ₹15/bag × 2 mo');
    });
  });

  describe('validateDeliveryForm with Modern Size', () => {
    const baseInput: ValidateDeliveryFormInput = {
      createGrnId: 'grn-1',
      createDate: '2026-10-06T10:00',
      smallBags: 0,
      bigBags: 0,
      totalWithdrawingBags: 50,
      availableSmall: 30,
      availableBig: 40,
      createVehicleNumber: 'UP32AA1111',
      createGpNumber: 'GP-0001',
      createDriverName: 'Ramesh Singh',
      isLoanHoldActive: false,
      selectedGrnNumber: 'GRN-26-27-0001',
      isModernSize: true,
      bagPrice: 60,
    };

    it('validates successfully when quantity and price are valid', () => {
      const res = validateDeliveryForm(baseInput);
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('requires price per bag when isModernSize is true', () => {
      const res = validateDeliveryForm({
        ...baseInput,
        bagPrice: undefined,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.bagPrice).toBe('Please enter a valid price per bag');
    });

    it('rejects non-positive price per bag', () => {
      const res = validateDeliveryForm({
        ...baseInput,
        bagPrice: 0,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.bagPrice).toBe('Please enter a valid price per bag');
    });

    it('rejects withdrawing more than total available stock', () => {
      const res = validateDeliveryForm({
        ...baseInput,
        totalWithdrawingBags: 80, // available total is 30 + 40 = 70
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.bags).toBe('Cannot deliver 80 bags (only 70 available)');
    });

    it('validates seasonal and monthly rates when dual rates are shown', () => {
      const res = validateDeliveryForm({
        ...baseInput,
        bagPrice: undefined,
        showSeasonalRate: true,
        showMonthlyRate: true,
        seasonalBagPrice: 120,
        monthlyBagPrice: 15,
      });
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('requires seasonalBagPrice when showSeasonalRate is true', () => {
      const res = validateDeliveryForm({
        ...baseInput,
        bagPrice: undefined,
        showSeasonalRate: true,
        seasonalBagPrice: undefined,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.seasonalBagPrice).toBe('Please enter a valid seasonal rate per bag');
    });

    it('requires monthlyBagPrice when showMonthlyRate is true', () => {
      const res = validateDeliveryForm({
        ...baseInput,
        bagPrice: undefined,
        showMonthlyRate: true,
        monthlyBagPrice: undefined,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.monthlyBagPrice).toBe('Please enter a valid monthly rate per bag');
    });
  });

  describe('computeOutwardRentCharge with Hybrid multi-year', () => {
    it('applies seasonalBagPrice for seasons and monthlyBagPrice for extension months', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Hybrid',
        smallBags: 10,
        bigBags: 10,
        inwardDate: '2024-07-10',
        deliveryDate: '2026-10-10',
        seasonalBagPrice: 100,
        monthlyBagPrice: 15,
      });
      // 20 bags * (3 seasons * 100 + 4 extension months * 15) = 20 * (300 + 60) = 7200
      expect(rent).toBe(7200);
    });
  });
});
