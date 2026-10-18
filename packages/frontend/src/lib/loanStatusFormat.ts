import type { LoanStatus } from '@cold-storage/contracts';

export interface LoanStatusDisplay {
  label: string;
  badgeLabel: string;
  variant: 'danger' | 'success' | 'neutral';
}

/**
 * Pure display formatter for GRN and Bond loan status.
 * Unifies presentation labels across tables, badges, detail modals, and control dialogs.
 */
export function getLoanStatusDisplay(status: LoanStatus | null | undefined): LoanStatusDisplay {
  switch (status) {
    case 'TAKEN':
      return {
        label: 'Loan Active (Hold)',
        badgeLabel: 'Loan Active (Hold)',
        variant: 'danger',
      };
    case 'CLEARED':
      return {
        label: 'Loan Cleared',
        badgeLabel: 'Loan Cleared',
        variant: 'success',
      };
    case 'NOT_TAKEN':
      return {
        label: 'Pledged (Loan Not Taken)',
        badgeLabel: 'Pledged',
        variant: 'neutral',
      };
    case 'NONE':
    default:
      return {
        label: 'Standard Storage',
        badgeLabel: '—',
        variant: 'neutral',
      };
  }
}
