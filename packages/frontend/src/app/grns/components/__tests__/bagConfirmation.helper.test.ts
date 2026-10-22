import { describe, expect, it } from 'vitest';
import { allocateHybridPreview, previewConfirmedSplit, validateBagConfirmation } from '../bagConfirmation.helper';

describe('bagConfirmation.helper (outward SSOT reuse)', () => {
  it('redirects Small and Big to the Small & Big split (no separate options)', () => {
    for (const category of ['Small', 'Big'] as const) {
      expect(validateBagConfirmation({
        category, quantity: '', bagPrice: '', seasonalBagPrice: '', monthlyBagPrice: '',
        repackSmall: '', repackBig: '', totalMovedBags: 50, isRepackRequired: false,
      })).toContain('Small & Big split');
    }
  });

  it('requires confirmed Small and Big counts for S/B when required, allowing repacked count changes', () => {
    for (const cat of ['S/B', 'Small & Big'] as const) {
      const base = {
        category: cat, quantity: '' as const, bagPrice: '' as const,
        seasonalBagPrice: '' as const, monthlyBagPrice: '' as const, totalMovedBags: 50, isRepackRequired: true,
      };
      expect(validateBagConfirmation({ ...base, repackSmall: '', repackBig: '' })).toContain('must be confirmed');
      expect(validateBagConfirmation({ ...base, repackSmall: -5, repackBig: 10 })).toContain('cannot be negative');
      expect(validateBagConfirmation({ ...base, repackSmall: 30, repackBig: 10 })).toBeNull(); // 40 bags is allowed!
      expect(validateBagConfirmation({ ...base, repackSmall: 35, repackBig: 25 })).toBeNull(); // 60 bags is allowed!
    }
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

  it('allocates Hybrid previews fill-small-first, reconciled to the total', () => {
    expect(allocateHybridPreview(30, 20, 50)).toEqual({ small: 30, big: 20 });
    expect(allocateHybridPreview(0, 0, 50)).toEqual({ small: 0, big: 50 });
    expect(allocateHybridPreview(10, 90, 50)).toEqual({ small: 10, big: 40 });
    const preview = previewConfirmedSplit({
      category: 'Hybrid', rawSmall: 28, rawBig: 22, total: 50,
      defaultSmall: 28, defaultBig: 22, repackSmall: '', repackBig: '', isRepackFilled: false,
    });
    expect(preview.small + preview.big).toBe(50);
    expect(previewConfirmedSplit({
      category: 'Small & Big', rawSmall: 0, rawBig: 50, total: 50,
      defaultSmall: 0, defaultBig: 50, repackSmall: 50, repackBig: 0, isRepackFilled: true,
    })).toEqual({ small: 50, big: 0 });
  });
});
