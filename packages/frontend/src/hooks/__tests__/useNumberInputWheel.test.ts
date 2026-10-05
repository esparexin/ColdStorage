import { describe, expect, it } from 'vitest';
import { calculateNextNumberValue, type NumberInputLike } from '../useNumberInputWheel';

function mockInput(attrs: { value?: string; step?: string; min?: string; max?: string }): NumberInputLike {
  return {
    value: attrs.value ?? '',
    getAttribute(name: string) {
      if (name === 'step') return attrs.step !== undefined ? attrs.step : null;
      if (name === 'min') return attrs.min !== undefined ? attrs.min : null;
      if (name === 'max') return attrs.max !== undefined ? attrs.max : null;
      return null;
    },
  };
}

describe('calculateNextNumberValue (scroll wheel direction handling)', () => {
  it('increases integer value when scrolling up', () => {
    const input = mockInput({ value: '10', min: '0', max: '100', step: '1' });
    expect(calculateNextNumberValue(input, 'up')).toBe('11');
  });

  it('decreases integer value when scrolling down', () => {
    const input = mockInput({ value: '10', min: '0', max: '100', step: '1' });
    expect(calculateNextNumberValue(input, 'down')).toBe('9');
  });

  it('respects min boundary and does not decrease below min', () => {
    const input = mockInput({ value: '0', min: '0', max: '100', step: '1' });
    expect(calculateNextNumberValue(input, 'down')).toBeNull();
  });

  it('respects max boundary and does not increase above max', () => {
    const input = mockInput({ value: '100', min: '0', max: '100', step: '1' });
    expect(calculateNextNumberValue(input, 'up')).toBeNull();
  });

  it('correctly handles decimal step (e.g. 0.01) on scroll up', () => {
    const input = mockInput({ value: '50', step: '0.01', min: '0' });
    expect(calculateNextNumberValue(input, 'up')).toBe('50.01');
  });

  it('correctly handles decimal step (e.g. 0.01) on scroll down without float drift', () => {
    const input = mockInput({ value: '50.01', step: '0.01', min: '0' });
    expect(calculateNextNumberValue(input, 'down')).toBe('50');
  });

  it('initializes empty field appropriately on scroll up', () => {
    const input = mockInput({ value: '', min: '0', step: '1' });
    expect(calculateNextNumberValue(input, 'up')).toBe('1');
  });

  it('initializes empty field with min > 0 on scroll up', () => {
    const input = mockInput({ value: '', min: '1', step: '1' });
    expect(calculateNextNumberValue(input, 'up')).toBe('1');
  });

  it('defaults step to 1 when step is "any" or missing', () => {
    const input = mockInput({ value: '5', step: 'any' });
    expect(calculateNextNumberValue(input, 'up')).toBe('6');
    expect(calculateNextNumberValue(input, 'down')).toBe('4');
  });
});
