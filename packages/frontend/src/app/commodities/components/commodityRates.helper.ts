export interface CommodityRatesFormState {
  seasonalSmall: number | '';
  seasonalBig: number | '';
  monthlySmall: number | '';
  monthlyBig: number | '';
}

export const EMPTY_RATES_FORM: CommodityRatesFormState = {
  seasonalSmall: '',
  seasonalBig: '',
  monthlySmall: '',
  monthlyBig: '',
};

export function parseRateInput(raw: string): number | '' {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') return '';
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : '';
}

function checkRate(value: number | '', label: string, errors: Record<string, string>, key: string): void {
  if (typeof value !== 'number' || !(value > 0)) {
    errors[key] = `${label} must be greater than zero`;
  } else if (value > 100000) {
    errors[key] = `${label} cannot exceed ₹100,000`;
  }
}

export function validateRatesForm(state: CommodityRatesFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  checkRate(state.seasonalSmall, 'Seasonal small-bag rate', errors, 'seasonalSmall');
  checkRate(state.seasonalBig, 'Seasonal big-bag rate', errors, 'seasonalBig');
  checkRate(state.monthlySmall, 'Monthly small-bag rate', errors, 'monthlySmall');
  checkRate(state.monthlyBig, 'Monthly big-bag rate', errors, 'monthlyBig');
  return errors;
}

export interface RateUpsertPayload {
  rentType: 'Seasonal' | 'Monthly';
  smallRate: number;
  bigRate: number;
}

export interface StoredCommodityRate {
  rentType: 'Seasonal' | 'Monthly';
  smallRate: number;
  bigRate: number;
}

/** Maps fetched controller rows onto the form; null when nothing is configured yet. */
export function hydrateRatesForm(rates: StoredCommodityRate[]): CommodityRatesFormState | null {
  if (rates.length === 0) return null;
  const byType = new Map(rates.map((r) => [r.rentType, r]));
  return {
    seasonalSmall: byType.get('Seasonal')?.smallRate ?? '',
    seasonalBig: byType.get('Seasonal')?.bigRate ?? '',
    monthlySmall: byType.get('Monthly')?.smallRate ?? '',
    monthlyBig: byType.get('Monthly')?.bigRate ?? '',
  };
}

/** Both payloads are always sent together so seasonal/monthly stay in sync. */
export function buildRatePayloads(state: CommodityRatesFormState): RateUpsertPayload[] {
  return [
    { rentType: 'Seasonal', smallRate: Number(state.seasonalSmall), bigRate: Number(state.seasonalBig) },
    { rentType: 'Monthly', smallRate: Number(state.monthlySmall), bigRate: Number(state.monthlyBig) },
  ];
}
