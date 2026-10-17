import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import { partitionMergeSources } from '../mergeEligibility.helper';

function grn(overrides: Partial<Grn> & { id: string }): Grn {
  return {
    facilityId: 'fac-1',
    grnNumber: 'GRN-0001',
    inwardReceiptNumber: 'RCPT-0001',
    date: new Date('2026-06-15'),
    customerId: 'cust-1',
    customerName: 'Customer',
    commodityId: 'cmd-1',
    commodityName: 'Commodity',
    chamber: 'CH-01',
    bags: 100,
    bagType: 'S/B',
    rentType: 'Seasonal',
    rentMonths: 10,
    rentAmount: 3000,
    smallBags: 100,
    bigBags: 0,
    status: 'OPEN',
    loanStatus: 'NONE',
    createdBy: 'usr-1',
    ...overrides,
  } as Grn;
}

describe('partitionMergeSources (future-season ineligibility)', () => {
  it('excludes future-season sources and counts them, keeping the backend guard authoritative', () => {
    const past = grn({ id: 'g-past', date: new Date('2024-06-15') });
    const same = grn({ id: 'g-same', date: new Date('2026-06-15') });
    const future = grn({ id: 'g-future', date: new Date('2027-06-15') });
    const { eligibleSources, futureSeasonCount } = partitionMergeSources(
      [past, same, future], 'target', 2026,
    );
    expect(eligibleSources.map((g) => g.id)).toEqual(['g-past', 'g-same']);
    expect(futureSeasonCount).toBe(1);
  });

  it('keeps excluding zero-balance, loan-hold, and target lots', () => {
    const zero = grn({ id: 'g-zero', bags: 0, closingBags: 0 });
    const loan = grn({ id: 'g-loan', loanStatus: 'TAKEN' });
    const target = grn({ id: 'target' });
    const ok = grn({ id: 'g-ok' });
    const { eligibleSources, futureSeasonCount } = partitionMergeSources(
      [zero, loan, target, ok], 'target', 2026,
    );
    expect(eligibleSources.map((g) => g.id)).toEqual(['g-ok']);
    expect(futureSeasonCount).toBe(0);
  });

  it('excludes sources with mismatched commodity or rent type', () => {
    const matching = grn({ id: 'g-match', commodityId: 'cmd-1', rentType: 'Seasonal' });
    const wrongCommodity = grn({ id: 'g-diff-cmd', commodityId: 'cmd-2', rentType: 'Seasonal' });
    const wrongRentType = grn({ id: 'g-diff-rent', commodityId: 'cmd-1', rentType: 'Monthly' });
    const { eligibleSources } = partitionMergeSources(
      [matching, wrongCommodity, wrongRentType],
      'target',
      2026,
      'cmd-1',
      'Seasonal',
    );
    expect(eligibleSources.map((g) => g.id)).toEqual(['g-match']);
  });
});
