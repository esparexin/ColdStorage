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

  it('validates Step 2 confirmed Small and Big counts for S/B', () => {
    const base = {
      category: 'S/B' as const, quantity: '' as const, bagPrice: '' as const,
      seasonalBagPrice: '' as const, monthlyBagPrice: '' as const,
      repackSmall: '' as const, repackBig: '' as const, totalMovedBags: 50, isRepackRequired: false,
    };
    expect(validateBagConfirmation({ ...base, smallBags: 30, bigBags: 20 })).toBeNull();
    expect(validateBagConfirmation({ ...base, smallBags: 30, bigBags: 15 })).toContain('must equal total moved bags');
    expect(validateBagConfirmation({ ...base, smallBags: -5, bigBags: 55 })).toContain('cannot be negative');
  });

  it('populates previewConfirmedSplit from Step 2 confirmed counts', () => {
    const preview = previewConfirmedSplit({
      category: 'S/B', rawSmall: 0, rawBig: 50, total: 50,
      defaultSmall: 0, defaultBig: 50, repackSmall: '', repackBig: '', isRepackFilled: false,
      confirmedSmall: 35, confirmedBig: 15,
    });
    expect(preview).toEqual({ small: 35, big: 15 });
  });

  it('prevents outward confirmed quantity from exceeding Total Bags', () => {
    const base = {
      category: 'S/B' as const, quantity: '' as const, bagPrice: '' as const,
      seasonalBagPrice: '' as const, monthlyBagPrice: '' as const,
      repackSmall: '' as const, repackBig: '' as const, totalMovedBags: 10, isRepackRequired: false,
    };
    // Boundary: exact configured total (10 bags)
    expect(validateBagConfirmation({ ...base, smallBags: 10, bigBags: 0 })).toBeNull();
    expect(validateBagConfirmation({ ...base, smallBags: 0, bigBags: 10 })).toBeNull();

    // Boundary: attempted outward quantity above total (e.g. 11 or 20)
    expect(validateBagConfirmation({ ...base, smallBags: 11, bigBags: 0 })).toContain('cannot exceed Total Bags');
    expect(validateBagConfirmation({ ...base, smallBags: 10, bigBags: 5 })).toContain('cannot exceed Total Bags');
    expect(validateBagConfirmation({ ...base, quantity: 15 })).toContain('cannot exceed Total Bags');
  });

  it('supports canonical bagType: "Hybrid" and "S/B" directly without requiring bagCategory', () => {
    expect(validateBagConfirmation({
      bagType: 'Hybrid', quantity: 50, bagPrice: 10, seasonalBagPrice: '', monthlyBagPrice: '',
      repackSmall: '', repackBig: '', totalMovedBags: 50, isRepackRequired: false,
    })).toBeNull();

    expect(validateBagConfirmation({
      bagType: 'S', quantity: '', bagPrice: '', seasonalBagPrice: '', monthlyBagPrice: '',
      repackSmall: '', repackBig: '', totalMovedBags: 50, isRepackRequired: false,
    })).toContain('Small & Big split');

    const preview = previewConfirmedSplit({
      bagType: 'Hybrid', rawSmall: 20, rawBig: 30, total: 50,
      defaultSmall: 20, defaultBig: 30, repackSmall: '', repackBig: '', isRepackFilled: false,
    });
    expect(preview).toEqual({ small: 20, big: 30 });
  });

  it('confirms 100% Big bags (matching screenshot with 12 Big bags)', () => {
    expect(validateBagConfirmation({
      category: 'S/B', quantity: 12, smallBags: 0, bigBags: 12,
      bagPrice: 15, seasonalBagPrice: 15, monthlyBagPrice: '',
      repackSmall: '', repackBig: '', totalMovedBags: 12, isRepackRequired: false,
    })).toBeNull();
  });

  it('confirms 100% Small bags with 12 Small bags', () => {
    expect(validateBagConfirmation({
      category: 'S/B', quantity: 12, smallBags: 12, bigBags: 0,
      bagPrice: 10, seasonalBagPrice: 10, monthlyBagPrice: '',
      repackSmall: '', repackBig: '', totalMovedBags: 12, isRepackRequired: false,
    })).toBeNull();
  });

  it('confirms mixed composition with 7 Small and 5 Big bags', () => {
    expect(validateBagConfirmation({
      category: 'S/B', quantity: 12, smallBags: 7, bigBags: 5,
      bagPrice: 10, seasonalBagPrice: 10, monthlyBagPrice: '',
      repackSmall: '', repackBig: '', totalMovedBags: 12, isRepackRequired: false,
    })).toBeNull();
  });
});


