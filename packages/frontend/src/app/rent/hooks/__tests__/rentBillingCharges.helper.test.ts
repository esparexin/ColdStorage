import { describe, expect, it } from 'vitest';
import type { RentSummaryDto } from '@cold-storage/contracts';
import {
  buildRentCalculationRows,
  resolveBillingHamaliRate,
  resolveBillingOutwardRates,
} from '../rentBillingCharges.helper';

function makeMockAccount(overrides: Partial<RentSummaryDto> = {}): RentSummaryDto {
  return {
    grnId: 'grn-1',
    grnNumber: '0007',
    facilityId: 'fac-1',
    customerId: 'cust-1',
    customerName: 'Kalyan',
    commodityId: 'cmd-1',
    commodityName: 'Mirchi',
    chamber: 'CH-1',
    inwardDate: new Date('2026-03-01'),
    totalBags: 140,
    bagType: 'S+B',
    smallBags: 70,
    bigBags: 70,
    deliveredBags: 90,
    remainingBags: 50,
    bagPrice: null,
    smallBagPrice: null,
    bigBagPrice: null,
    totalBagsWeight: null,
    rentType: 'Seasonal',
    rentAmount: 15250,
    outwardRentCharges: 15250,
    hamaliShare: 0,
    rentMonths: null,
    totalPaid: 0,
    remainingBalance: 15250,
    paymentStatus: 'Not Settled',
    rentState: 'UNBILLED',
    verificationReason: null,
    payments: [],
    extensions: [],
    totalDue: 15250,
    remarks: null,
    ...overrides,
  };
}

describe('rentBillingCharges.helper', () => {
  describe('resolveBillingOutwardRates', () => {
    it('uses custom per-GRN prices when present', () => {
      const account = makeMockAccount({ smallBagPrice: 130, bigBagPrice: 215 });
      const rates = resolveBillingOutwardRates(account, { smallRate: 125, bigRate: 205 });
      expect(rates).toEqual({ small: 130, big: 215 });
    });

    it('falls back to active commodity controller rate when GRN has no custom price', () => {
      const account = makeMockAccount({ smallBagPrice: null, bigBagPrice: null });
      const rates = resolveBillingOutwardRates(account, { smallRate: 125, bigRate: 205 });
      expect(rates).toEqual({ small: 125, big: 205 });
    });

    it('falls back to canonical rates when no custom price or active rate exists', () => {
      const account = makeMockAccount({ smallBagPrice: null, bigBagPrice: null });
      const rates = resolveBillingOutwardRates(account, null);
      expect(rates).toEqual({ small: 10, big: 15 });
    });
  });

  describe('resolveBillingHamaliRate', () => {
    it('uses commodity hamaliRate when account has no hamaliShare', () => {
      const account = makeMockAccount({ totalBags: 100, hamaliShare: undefined });
      expect(resolveBillingHamaliRate(account, { hamaliRate: 25 })).toBe(25);
    });

    it('derives hamali rate from account hamaliShare / totalBags', () => {
      const account = makeMockAccount({ totalBags: 100, hamaliShare: 2500 });
      expect(resolveBillingHamaliRate(account, null)).toBe(25);
    });

    it('preserves historical zero hamali snapshot when hamaliShare is 0', () => {
      const account = makeMockAccount({ totalBags: 100, hamaliShare: 0 });
      expect(resolveBillingHamaliRate(account, { hamaliRate: 25 })).toBeUndefined();
    });

    it('returns undefined when neither is configured', () => {
      const account = makeMockAccount({ totalBags: 100, hamaliShare: 0 });
      expect(resolveBillingHamaliRate(account, null)).toBeUndefined();
    });
  });

  describe('buildRentCalculationRows', () => {
    it('returns empty array when outward assessed', () => {
      const account = makeMockAccount();
      const rows = buildRentCalculationRows({
        account,
        originSeason: 2026,
        effectiveStorageAmount: 15250,
        excludePeriodKeys: [],
        hamaliDue: 0,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('storage-rent');
    });
  });
});

