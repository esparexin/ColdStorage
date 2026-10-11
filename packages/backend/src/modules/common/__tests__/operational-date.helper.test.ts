import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLOCK_SKEW_TOLERANCE_MS,
  MAX_BACKDATE_DAYS,
  MAX_HISTORICAL_TESTING_DAYS,
  isHistoricalTestingAllowed,
  validateOperationalDate,
} from '../operational-date.helper.js';

describe('validateOperationalDate - Operational Date Guardrails', () => {
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;
  // Deterministic reference anchor: 11 October 2026 (FY '26-27')
  const referenceNow = new Date('2026-10-11T12:00:00.000Z');

  beforeEach(() => {
    delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
  });

  describe('Standard Production Rules (ALLOW_HISTORICAL_TESTING_DATES unset/disabled)', () => {
    it('1. accepts current date in active financial year', () => {
      const result = validateOperationalDate(referenceNow, {
        label: 'Inward',
        now: referenceNow,
      });
      expect(result.toISOString()).toBe(referenceNow.toISOString());
    });

    it('2. accepts backdated date within 30 days in active financial year', () => {
      const validPast = new Date(referenceNow.getTime() - 20 * 24 * 60 * 60 * 1000);
      const result = validateOperationalDate(validPast, {
        label: 'Delivery',
        now: referenceNow,
      });
      expect(result.toISOString()).toBe(validPast.toISOString());
    });

    it('3. rejects future date beyond 5-minute skew tolerance', () => {
      const futureDate = new Date(referenceNow.getTime() + CLOCK_SKEW_TOLERANCE_MS + 1000);
      expect(() =>
        validateOperationalDate(futureDate, { label: 'Inward', now: referenceNow }),
      ).toThrow('Inward date cannot be in the future');
    });

    it('4. accepts future date within 5-minute clock-skew tolerance', () => {
      const tolerantDate = new Date(referenceNow.getTime() + 2 * 60 * 1000);
      const result = validateOperationalDate(tolerantDate, {
        label: 'Delivery',
        now: referenceNow,
      });
      expect(result.toISOString()).toBe(tolerantDate.toISOString());
    });

    it('5. rejects date belonging to a past financial year (e.g. FY 24-25 vs active 26-27)', () => {
      const pastFyDate = new Date('2024-08-12T00:00:00.000Z');
      expect(() =>
        validateOperationalDate(pastFyDate, { label: 'Inward', now: referenceNow }),
      ).toThrow("Inward date belongs to Financial Year '24-25', but current active FY is '26-27'");
    });

    it('6. rejects date exceeding 30-day window even if within same financial year', () => {
      // 45 days before 11 Oct 2026 is late August 2026 (still FY '26-27')
      const pastDate = new Date(referenceNow.getTime() - 45 * 24 * 60 * 60 * 1000);
      expect(() =>
        validateOperationalDate(pastDate, { label: 'Inward', now: referenceNow }),
      ).toThrow(`Inward date exceeds permitted ${MAX_BACKDATE_DAYS}-day operational backdating window`);
    });

    it('7. respects enforceFinancialYear: false and enforceBackdatingWindow: false (payment semantics)', () => {
      const pastDate = new Date('2024-08-12T00:00:00.000Z');
      const result = validateOperationalDate(pastDate, {
        label: 'Payment',
        enforceFinancialYear: false,
        enforceBackdatingWindow: false,
        now: referenceNow,
      });
      expect(result.toISOString()).toBe(pastDate.toISOString());
    });
  });

  describe('Testing Allowance (ALLOW_HISTORICAL_TESTING_DATES=true)', () => {
    it('8. isHistoricalTestingAllowed reflects environment variable', () => {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
      expect(isHistoricalTestingAllowed()).toBe(true);

      process.env.ALLOW_HISTORICAL_TESTING_DATES = 'false';
      expect(isHistoricalTestingAllowed()).toBe(false);

      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
      expect(isHistoricalTestingAllowed()).toBe(false);
    });

    it('9. accepts historical dates in past financial years within 3-year window', () => {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';

      // FY 24-25 (~2.1 years prior to referenceNow)
      const dateFy2425 = new Date('2024-08-12T00:00:00.000Z');
      const resultInward = validateOperationalDate(dateFy2425, {
        label: 'Inward',
        now: referenceNow,
      });
      expect(resultInward.toISOString()).toBe(dateFy2425.toISOString());

      // FY 25-26 (~1.3 years prior to referenceNow)
      const dateFy2526 = new Date('2025-06-15T00:00:00.000Z');
      const resultDelivery = validateOperationalDate(dateFy2526, {
        label: 'Delivery',
        now: referenceNow,
      });
      expect(resultDelivery.toISOString()).toBe(dateFy2526.toISOString());
    });

    it('10. still strictly rejects future dates even with testing flag enabled', () => {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
      const futureDate = new Date(referenceNow.getTime() + 10 * 60 * 1000);
      expect(() =>
        validateOperationalDate(futureDate, { label: 'Inward', now: referenceNow }),
      ).toThrow('Inward date cannot be in the future');
    });

    it('11. rejects dates older than the 3-year historical window', () => {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
      // 3.5 years prior to referenceNow
      const overlyOld = new Date(
        referenceNow.getTime() - (MAX_HISTORICAL_TESTING_DAYS + 180) * 24 * 60 * 60 * 1000,
      );
      expect(() =>
        validateOperationalDate(overlyOld, { label: 'Inward', now: referenceNow }),
      ).toThrow('Inward date exceeds permitted 3-year historical testing window');
    });

    it('12. supports explicit options.allowHistoricalTesting override without mutating process.env', () => {
      // process.env remains unset
      const dateFy2425 = new Date('2024-08-12T00:00:00.000Z');

      // Without override -> throws FY error
      expect(() =>
        validateOperationalDate(dateFy2425, { label: 'Inward', now: referenceNow }),
      ).toThrow("Inward date belongs to Financial Year '24-25', but current active FY is '26-27'");

      // With override -> succeeds
      const result = validateOperationalDate(dateFy2425, {
        label: 'Inward',
        now: referenceNow,
        allowHistoricalTesting: true,
      });
      expect(result.toISOString()).toBe(dateFy2425.toISOString());
    });
  });
});
