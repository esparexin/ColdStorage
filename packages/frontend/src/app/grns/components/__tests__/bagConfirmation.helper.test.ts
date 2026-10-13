import { describe, expect, it } from 'vitest';
import { allocateHybridPreview, previewConfirmedSplit, validateBagConfirmation } from '../bagConfirmation.helper';

describe('bagConfirmation.helper (outward SSOT reuse)', () => {
  it('accepts Small and Big without counts', () => {
    expect(validateBagConfirmation({
      category: 'Small', quantity: '', bagPrice: '', seasonalBagPrice: '', monthlyBagPrice: '',
      repackSmall: '', repackBig: '', totalMovedBags: 50, isRepackRequired: false,
    })).toBeNull();
    expect(validateBagConfirmation({
      category: 'Big', quantity: '', bagPrice: '', seasonalBagPrice: '', monthlyBagPrice: '',
      repackSmall: '', repackBig: '', totalMovedBags: 50, isRepackRequired: true,
    })).toBeNull();
  });

  it('requires a reconciling split for Small & Big when required', () => {
    const base = {
      category: 'Small & Big' as const, quantity: '' as const, bagPrice: '' as const,
      seasonalBagPrice: '' as const, monthlyBagPrice: '' as const, totalMovedBags: 50, isRepackRequired: true,
    };
    expect(validateBagConfirmation({ ...base, repackSmall: '', repackBig: '' })).toContain('must be confirmed');
    expect(validateBagConfirmation({ ...base, repackSmall: 30, repackBig: 10 })).toContain('must match total available');
    expect(validateBagConfirmation({ ...base, repackSmall: 30, repackBig: 20 })).toBeNull();
  });

  it('requires Hybrid quantity to match the moved total plus a valid rate', () => {
    const base = {
      category: 'Hybrid' as const, repackSmall: '' as const, repackBig: '' as const,
      totalMovedBags: 50, isRepackRequired: false,
    };
    expect(validateBagConfirmation({ ...base, quantity: '', bagPrice: '', seasonalBagPrice: '', monthlyBagPrice: '' })).toContain('positive whole number');
    expect(validateBagConfirmation({ ...base, quantity: 20, bagPrice: 10, seasonalBagPrice: '', monthlyBagPrice: '' })).toContain('must match total moved stock');
    expect(validateBagConfirmation({ ...base, quantity: 50, bagPrice: '', seasonalBagPrice: '', monthlyBagPrice: '' })).toContain('per-bag rate');
    expect(validateBagConfirmation({ ...base, quantity: 50, bagPrice: '', seasonalBagPrice: '', monthlyBagPrice: 10 })).toBeNull();
  });

  it('treats Mixed like Hybrid without reinterpretation', () => {
    expect(validateBagConfirmation({
      category: 'Mixed', quantity: 50, bagPrice: 10, seasonalBagPrice: '', monthlyBagPrice: '',
      repackSmall: '', repackBig: '', totalMovedBags: 50, isRepackRequired: false,
    })).toBeNull();
  });

  it('allocates Hybrid previews by ledger proportion, reconciled to the total', () => {
    expect(allocateHybridPreview(30, 20, 50)).toEqual({ small: 30, big: 20 });
    expect(allocateHybridPreview(0, 0, 50)).toEqual({ small: 50, big: 0 });
    const preview = previewConfirmedSplit({
      category: 'Hybrid', rawSmall: 28, rawBig: 22, total: 50,
      defaultSmall: 28, defaultBig: 22, repackSmall: '', repackBig: '', isRepackFilled: false,
    });
    expect(preview.small + preview.big).toBe(50);
    expect(previewConfirmedSplit({
      category: 'Small', rawSmall: 0, rawBig: 50, total: 50,
      defaultSmall: 0, defaultBig: 50, repackSmall: '', repackBig: '', isRepackFilled: false,
    })).toEqual({ small: 50, big: 0 });
  });
});
