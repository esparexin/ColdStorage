import { describe, expect, it } from 'vitest';
import {
  buildRatePayloads,
  EMPTY_RATES_FORM,
  hydrateRatesForm,
  parseRateInput,
  validateRatesForm,
} from '../commodityRates.helper';

describe('commodityRates.helper', () => {
  it('parses numeric rate input and rejects non-numeric text', () => {
    expect(parseRateInput('12')).toBe(12);
    expect(parseRateInput('12.50')).toBe(12.5);
    expect(parseRateInput('')).toBe('');
    expect(parseRateInput('  ')).toBe('');
    expect(parseRateInput('abc')).toBe('');
    expect(parseRateInput('.')).toBe('');
  });

  it('accepts a fully populated seasonal/monthly form', () => {
    const errors = validateRatesForm({
      seasonalSmall: 12,
      seasonalBig: 18,
      monthlySmall: 10,
      monthlyBig: 15,
    });
    expect(errors).toEqual({});
  });

  it('rejects non-positive and excessive rates per field', () => {
    const errors = validateRatesForm({ ...EMPTY_RATES_FORM, seasonalSmall: 0, monthlyBig: 100001 });
    expect(errors.seasonalSmall).toContain('greater than zero');
    expect(errors.seasonalBig).toContain('greater than zero');
    expect(errors.monthlySmall).toContain('greater than zero');
    expect(errors.monthlyBig).toContain('cannot exceed');
  });

  it('hydrates the form from stored rows and reports unconfigured commodities', () => {
    expect(hydrateRatesForm([])).toBeNull();
    expect(
      hydrateRatesForm([
        { rentType: 'Seasonal', smallRate: 12, bigRate: 18 },
        { rentType: 'Monthly', smallRate: 10, bigRate: 15 },
      ]),
    ).toEqual({ seasonalSmall: 12, seasonalBig: 18, monthlySmall: 10, monthlyBig: 15 });
    expect(hydrateRatesForm([{ rentType: 'Monthly', smallRate: 10, bigRate: 15 }])).toEqual({
      ...EMPTY_RATES_FORM,
      monthlySmall: 10,
      monthlyBig: 15,
    });
  });

  it('builds synchronized seasonal and monthly upsert payloads', () => {
    expect(
      buildRatePayloads({ seasonalSmall: 12, seasonalBig: 18, monthlySmall: 10, monthlyBig: 15 }),
    ).toEqual([
      { rentType: 'Seasonal', smallRate: 12, bigRate: 18 },
      { rentType: 'Monthly', smallRate: 10, bigRate: 15 },
    ]);
  });
});
