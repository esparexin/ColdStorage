import { describe, expect, it } from 'vitest';
import { formatDisplayBagType } from '../bag-display.js';

describe('formatDisplayBagType contracts SSOT', () => {
  it('formats single type S and B correctly', () => {
    expect(formatDisplayBagType({ bagType: 'S' })).toBe('Small');
    expect(formatDisplayBagType({ bagType: 'B' })).toBe('Big');
    expect(formatDisplayBagType({ category: 'Small' })).toBe('Small');
    expect(formatDisplayBagType({ category: 'Big' })).toBe('Big');
  });

  it('formats verified composition with all small or all big bags', () => {
    expect(formatDisplayBagType({ bagType: 'S/B', smallBags: 10, bigBags: 0 })).toBe('Small');
    expect(formatDisplayBagType({ bagType: 'S/B', smallBags: 0, bigBags: 10 })).toBe('Big');
    expect(formatDisplayBagType({ bagType: 'S+B', smallBags: 5, bigBags: 0 })).toBe('Small');
  });

  it('formats mixed or unsegregated S/B as Small & Big', () => {
    expect(formatDisplayBagType({ bagType: 'S/B', smallBags: 10, bigBags: 10 })).toBe('Small & Big');
    expect(formatDisplayBagType({ bagType: 'S/B', smallBags: 10, bigBags: 0, isCompositionVerified: false })).toBe('Unconfirmed');
    expect(formatDisplayBagType({ bagType: 'S/B', smallBags: 0, bigBags: 10, isCompositionVerified: false })).toBe('Unconfirmed');
    expect(formatDisplayBagType({ bagType: 'S/B', smallBags: 0, bigBags: 0, isCompositionVerified: null })).toBe('Unconfirmed');
    expect(formatDisplayBagType({ bagType: 'S/B', isCompositionVerified: null })).toBe('Unconfirmed');
    expect(formatDisplayBagType({ bagType: 'S/B' })).toBe('Small & Big');
    expect(formatDisplayBagType({ bagType: 'S+B' })).toBe('Small & Big');
    expect(formatDisplayBagType({ category: 'Small & Big' })).toBe('Small & Big');
  });

  it('formats hybrid categories cleanly', () => {
    expect(formatDisplayBagType({ isHybrid: true })).toBe('Hybrid');
    expect(formatDisplayBagType({ category: 'Hybrid' })).toBe('Hybrid');
    expect(formatDisplayBagType({ category: 'Modern' })).toBe('Hybrid');
    expect(formatDisplayBagType({ category: 'Mixed' })).toBe('Hybrid');
  });
});
