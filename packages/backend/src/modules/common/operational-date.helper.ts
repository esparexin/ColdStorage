import { getFinancialYearKey } from '@cold-storage/contracts';

/**
 * Canonical operational date-window guardrails (P4/P6).
 *
 * Documents may not be dated in the future (small clock-skew tolerance), may not be dated in
 * a different financial year than the active one, and may not exceed a 30-day backdating
 * window. These rules were previously restated in the GRN, delivery and rent paths, which
 * risked the three drifting apart; they now have a single owner.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
export const MAX_BACKDATE_DAYS = 30;

export interface OperationalDateOptions {
  /** Human label used in error messages, e.g. 'Inward', 'Delivery'. */
  label: string;
  /** When false, the financial-year containment check is skipped. */
  enforceFinancialYear?: boolean;
  /**
   * When false, only the future-date check is applied. Used by rent payments because
   * backdated payment entry rules are explicitly parked in the P0 lock and must not be
   * invented by the implementation.
   */
  enforceBackdatingWindow?: boolean;
  now?: Date;
}

export function validateOperationalDate(
  inputDate: string | Date | undefined,
  options: OperationalDateOptions,
): Date {
  const now = options.now ?? new Date();
  const operationalDate = new Date(inputDate ?? now);

  if (Number.isNaN(operationalDate.getTime())) {
    throw new Error(`${options.label} date is not a valid date`);
  }

  if (operationalDate.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) {
    throw new Error(`${options.label} date cannot be in the future`);
  }

  if (options.enforceFinancialYear !== false) {
    const currentFy = getFinancialYearKey(now);
    const operationalFy = getFinancialYearKey(operationalDate);
    if (operationalFy !== currentFy) {
      throw new Error(
        `${options.label} date belongs to Financial Year '${operationalFy}', but current active FY is '${currentFy}'`,
      );
    }
  }

  if (options.enforceBackdatingWindow === false) {
    return operationalDate;
  }

  const maxPastAllowed = new Date(
    now.getTime() - MAX_BACKDATE_DAYS * 24 * 60 * 60 * 1000,
  );
  if (operationalDate < maxPastAllowed) {
    throw new Error(
      `${options.label} date exceeds permitted ${MAX_BACKDATE_DAYS}-day operational backdating window`,
    );
  }

  return operationalDate;
}