import { afterAll, beforeAll } from 'vitest';

/**
 * Hermetic historical-dates allowance for cross-season suites.
 *
 * `validateOperationalDate` rejects any date outside the active financial year, and
 * anything older than the 30-day backdating window, unless
 * `ALLOW_HISTORICAL_TESTING_DATES=true`. Suites whose subject is inherently
 * cross-season behaviour (merging a prior-season lot, accruing multi-year rent) must
 * therefore opt in explicitly: reading the developer's untracked `.env.local` leaves
 * the guard silently disabled locally while CI — which has no such file — enforces it
 * and fails. Declaring the allowance here makes the dependency part of the suite.
 */
export function useHistoricalTestingDates(): void {
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeAll(() => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
  });
}