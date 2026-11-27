import { describe, expect, it } from 'vitest';
import { formatOutwardCompositionText } from '../grnOutwardDetails.helper';

describe('formatOutwardCompositionText', () => {
  it('formats S/B lot with Small and Big bag breakdown', () => {
    const text = formatOutwardCompositionText({
      totalBags: 21,
      smallBags: 5,
      bigBags: 16,
      bagType: 'S/B',
    });

    expect(text).toBe('Small - 5, Big - 16');
  });

  it('formats Hybrid lot with explicit Hybrid label and total count', () => {
    const text = formatOutwardCompositionText({
      totalBags: 21,
      smallBags: 0,
      bigBags: 0,
      bagType: 'Hybrid',
    });

    expect(text).toBe('Hybrid - 21 bags');
  });

  it('formats hybrid category correctly when bagCategory is Hybrid', () => {
    const text = formatOutwardCompositionText({
      totalBags: 50,
      smallBags: 0,
      bigBags: 0,
      bagCategory: 'Hybrid',
      bagType: 'Normal',
    });

    expect(text).toBe('Hybrid - 50 bags');
  });
});
