import { describe, expect, it } from 'vitest';
import { getLoanStatusDisplay } from '../loanStatusFormat';

describe('loanStatusFormat', () => {
  it('formats TAKEN loan status with danger variant and active hold copy', () => {
    const res = getLoanStatusDisplay('TAKEN');
    expect(res).toEqual({
      label: 'Loan Active (Hold)',
      badgeLabel: 'Loan Active (Hold)',
      variant: 'danger',
    });
  });

  it('formats CLEARED loan status with success variant and cleared copy', () => {
    const res = getLoanStatusDisplay('CLEARED');
    expect(res).toEqual({
      label: 'Loan Cleared',
      badgeLabel: 'Loan Cleared',
      variant: 'success',
    });
  });

  it('formats NOT_TAKEN loan status with neutral variant and pledged copy', () => {
    const res = getLoanStatusDisplay('NOT_TAKEN');
    expect(res).toEqual({
      label: 'Pledged (Loan Not Taken)',
      badgeLabel: 'Pledged',
      variant: 'neutral',
    });
  });

  it('formats NONE loan status with neutral variant and standard storage copy', () => {
    const res = getLoanStatusDisplay('NONE');
    expect(res).toEqual({
      label: 'Standard Storage',
      badgeLabel: '—',
      variant: 'neutral',
    });
  });

  it('formats null/undefined loan status as standard storage fallback', () => {
    expect(getLoanStatusDisplay(null)).toEqual({
      label: 'Standard Storage',
      badgeLabel: '—',
      variant: 'neutral',
    });
    expect(getLoanStatusDisplay(undefined)).toEqual({
      label: 'Standard Storage',
      badgeLabel: '—',
      variant: 'neutral',
    });
  });
});
