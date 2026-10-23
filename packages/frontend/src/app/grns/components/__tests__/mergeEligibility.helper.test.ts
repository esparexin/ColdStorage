import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import {
  filterEligibleTargetGrns,
  findForwardMergeTarget,
  partitionMergeSources,
  resolveInitialMergeState,
  resolveNextSelectedSources,
} from '../mergeEligibility.helper';

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

describe('findForwardMergeTarget', () => {
  it('prefers same customer newer season lot as surviving target', () => {
    const older = grn({ id: 'g-2024', customerId: 'cust-1', date: new Date('2024-06-15') });
    const newerSameCust = grn({ id: 'g-2026-c1', customerId: 'cust-1', date: new Date('2026-04-15') });
    const newerDiffCust = grn({ id: 'g-2026-c2', customerId: 'cust-2', date: new Date('2026-05-15') });

    const target = findForwardMergeTarget(older, [older, newerSameCust, newerDiffCust]);
    expect(target?.id).toBe('g-2026-c1');
  });

  it('returns null when no newer compatible season exists', () => {
    const latest = grn({ id: 'g-2026', customerId: 'cust-1', date: new Date('2026-06-15') });
    const older = grn({ id: 'g-2024', customerId: 'cust-1', date: new Date('2024-06-15') });

    const target = findForwardMergeTarget(latest, [latest, older]);
    expect(target).toBeNull();
  });
});

describe('filterEligibleTargetGrns', () => {
  it('filters out loan-hold, zero-stock, mismatched commodity/rent, and selected sources', () => {
    const current = grn({ id: 'g-0004', date: new Date('2024-06-15'), commodityId: 'cmd-1', rentType: 'Seasonal' });
    const validTarget = grn({ id: 'g-3524', date: new Date('2026-06-15'), commodityId: 'cmd-1', rentType: 'Seasonal', bags: 50 });
    const loanTarget = grn({ id: 'g-loan', date: new Date('2026-06-15'), commodityId: 'cmd-1', rentType: 'Seasonal', loanStatus: 'TAKEN' });
    const zeroTarget = grn({ id: 'g-zero', date: new Date('2026-06-15'), commodityId: 'cmd-1', rentType: 'Seasonal', bags: 0, closingBags: 0 });
    const selectedSource = grn({ id: 'g-3496', date: new Date('2026-06-15'), commodityId: 'cmd-1', rentType: 'Seasonal', bags: 20 });
    const olderTarget = grn({ id: 'g-2023', date: new Date('2023-06-15'), commodityId: 'cmd-1', rentType: 'Seasonal', bags: 30 });

    const targets = filterEligibleTargetGrns(
      [current, validTarget, loanTarget, zeroTarget, selectedSource, olderTarget],
      current,
      ['g-3496'],
      validTarget.id,
    );

    expect(targets.map((g) => g.id)).toContain('g-3524');
    expect(targets.map((g) => g.id)).not.toContain('g-loan');
    expect(targets.map((g) => g.id)).not.toContain('g-zero');
    expect(targets.map((g) => g.id)).not.toContain('g-3496');
    expect(targets.map((g) => g.id)).not.toContain('g-2023');
  });
});

describe('resolveNextSelectedSources', () => {
  it('preserves initiating source when destination changes and never allows destination as source', () => {
    const src2024 = grn({ id: 'g-0004', date: new Date('2024-06-15') });
    const src2025 = grn({ id: 'g-3400', date: new Date('2025-06-15') });
    const target2026 = grn({ id: 'g-3524', date: new Date('2026-06-15') });
    const newTarget2025 = grn({ id: 'g-3450', date: new Date('2025-05-15') });
    const all = [src2024, src2025, target2026, newTarget2025];

    // Switching to 3524 (2026) preserves 0004 and removes 3524 from sources
    const result1 = resolveNextSelectedSources('g-0004', 'g-3524', ['g-0004', 'g-3524'], all);
    expect(result1).toEqual(['g-0004']);

    // Switching to 2025 target prunes sources newer than 2025 but preserves 0004
    const src2026 = grn({ id: 'g-3550', date: new Date('2026-06-15') });
    const allWithNewer = [...all, src2026];
    const result2 = resolveNextSelectedSources('g-0004', 'g-3450', ['g-0004', 'g-3550'], allWithNewer);
    expect(result2).toContain('g-0004');
    expect(result2).not.toContain('g-3550');
    expect(result2).not.toContain('g-3450');
  });

  it('does not force any initiating source when currentGrnId is undefined in standalone mode', () => {
    const src2024 = grn({ id: 'g-0004', date: new Date('2024-06-15') });
    const target2026 = grn({ id: 'g-3524', date: new Date('2026-06-15') });
    const all = [src2024, target2026];

    const result = resolveNextSelectedSources(undefined, 'g-3524', ['g-0004'], all);
    expect(result).toEqual(['g-0004']);

    const result2 = resolveNextSelectedSources(undefined, 'g-0004', ['g-0004'], all);
    expect(result2).toEqual([]);
  });
});

describe('resolveInitialMergeState', () => {
  it('selects forward target and sets initiating GRN as initial source when initiating from earlier season', () => {
    const older = grn({ id: 'g-0004', date: new Date('2024-06-15'), customerId: 'c1' });
    const newer = grn({ id: 'g-3524', date: new Date('2026-06-15'), customerId: 'c1' });

    const state = resolveInitialMergeState(older, [older, newer]);
    expect(state.initialTargetId).toBe('g-3524');
    expect(state.initialSourceIds).toEqual(['g-0004']);
  });

  it('selects self as target with empty source list when initiating from current latest season', () => {
    const current = grn({ id: 'g-3524', date: new Date('2026-06-15') });
    const older = grn({ id: 'g-0004', date: new Date('2024-06-15') });

    const state = resolveInitialMergeState(current, [current, older]);
    expect(state.initialTargetId).toBe('g-3524');
    expect(state.initialSourceIds).toEqual([]);
  });
});
