import { describe, expect, it } from 'vitest';
import { validateTransferConfirmation } from '../transferTabValidation.helper';

describe('validateTransferConfirmation', () => {
  it('returns null when composition is verified and not hybrid', () => {
    expect(
      validateTransferConfirmation({
        isUnverified: false,
        remainingBags: 100,
        confirmedSmallBags: '',
        confirmedBigBags: '',
      }),
    ).toBeNull();
  });

  it('requires confirmed Small and Big counts for unverified lots', () => {
    expect(
      validateTransferConfirmation({
        isUnverified: true,
        remainingBags: 100,
        confirmedSmallBags: '',
        confirmedBigBags: '',
      }),
    ).toContain('Confirmed composition required');

    expect(
      validateTransferConfirmation({
        isUnverified: true,
        remainingBags: 100,
        confirmedSmallBags: 60,
        confirmedBigBags: '',
      }),
    ).toContain('Confirmed composition required');
  });

  it('rejects unverified counts that do not reconcile to remaining stock', () => {
    expect(
      validateTransferConfirmation({
        isUnverified: true,
        remainingBags: 100,
        confirmedSmallBags: 60,
        confirmedBigBags: 30,
      }),
    ).toContain('must equal stock of 100 bags');
  });

  it('accepts reconciling unverified Small and Big counts', () => {
    expect(
      validateTransferConfirmation({
        isUnverified: true,
        remainingBags: 100,
        confirmedSmallBags: 60,
        confirmedBigBags: 40,
      }),
    ).toBeNull();
  });

  it('validates Hybrid quantity matching remaining stock and requiring a rate', () => {
    // Missing / invalid quantity
    expect(
      validateTransferConfirmation({
        isUnverified: true,
        remainingBags: 50,
        confirmedSmallBags: '',
        confirmedBigBags: '',
        sourceBagCategory: 'Hybrid',
        sourceQuantity: '',
      }),
    ).toContain('positive whole number');

    // Quantity mismatch
    expect(
      validateTransferConfirmation({
        isUnverified: true,
        remainingBags: 50,
        confirmedSmallBags: '',
        confirmedBigBags: '',
        sourceBagCategory: 'Hybrid',
        sourceQuantity: 40,
        sourceBagPrice: 15,
      }),
    ).toContain('must match available stock of 50 bags');

    // Missing rates
    expect(
      validateTransferConfirmation({
        isUnverified: true,
        remainingBags: 50,
        confirmedSmallBags: '',
        confirmedBigBags: '',
        sourceBagCategory: 'Hybrid',
        sourceQuantity: 50,
      }),
    ).toContain('require a per-bag rate');

    // Valid with seasonal rate
    expect(
      validateTransferConfirmation({
        isUnverified: true,
        remainingBags: 50,
        confirmedSmallBags: '',
        confirmedBigBags: '',
        sourceBagCategory: 'Hybrid',
        sourceQuantity: 50,
        sourceSeasonalBagPrice: 120,
      }),
    ).toBeNull();

    // Valid with monthly rate
    expect(
      validateTransferConfirmation({
        isUnverified: false,
        remainingBags: 50,
        confirmedSmallBags: '',
        confirmedBigBags: '',
        sourceBagCategory: 'Hybrid',
        sourceQuantity: 50,
        sourceMonthlyBagPrice: 15,
      }),
    ).toBeNull();
  });

  it('supports legacy positional arguments', () => {
    expect(validateTransferConfirmation(false, 100, '', '')).toBeNull();
    expect(validateTransferConfirmation(true, 100, '', '')).toContain('Confirmed composition required');
    expect(validateTransferConfirmation(true, 100, 60, 40)).toBeNull();
  });
});
