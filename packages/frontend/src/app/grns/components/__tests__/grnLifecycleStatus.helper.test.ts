import { describe, expect, it } from 'vitest';
import { resolveGrnLifecycleStatus } from '../grnLifecycleStatus.helper';

describe('grnLifecycleStatus.helper', () => {
  it('resolves zero-balance merged source GRN as Closed even if DB status is OPEN', () => {
    const res = resolveGrnLifecycleStatus({
      bags: 100,
      closingBags: 0,
      status: 'OPEN',
      mergedIntoGrnNumber: '0012',
      mergedIntoGrnId: 'grn-0012',
    });
    expect(res.badge).toBe('Closed');
    expect(res.variant).toBe('neutral');
    expect(res.icon).toBe('GitMerge');
    expect(res.mergedReference).toBe('Merged → 0012');
  });

  it('resolves merged source GRN with status CLOSED as Closed', () => {
    const res = resolveGrnLifecycleStatus({
      bags: 100,
      closingBags: 0,
      status: 'CLOSED',
      mergedIntoGrnNumber: '0012',
    });
    expect(res.badge).toBe('Closed');
    expect(res.mergedReference).toBe('Merged → 0012');
  });

  it('resolves merged consignment target whose balance reaches 0 as Closed', () => {
    const res = resolveGrnLifecycleStatus({
      bags: 140,
      closingBags: 0,
      status: 'OPEN',
      remarks: '[MERGE RECEIVED from GRN 0011 on 2026-05-01: 140 bags]',
    });
    expect(res.badge).toBe('Closed');
    expect(res.isMergedLot).toBe(true);
  });

  it('resolves completely outwarded GRN with pending rent as Closed', () => {
    const res = resolveGrnLifecycleStatus({
      bags: 100,
      netDeliveredBags: 100,
      closingBags: 0,
      status: 'OPEN',
    });
    expect(res.badge).toBe('Closed');
    expect(res.variant).toBe('neutral');
    expect(res.icon).toBe('Check');
  });

  it('resolves merged source with remaining bags > 0 as Merged', () => {
    const res = resolveGrnLifecycleStatus({
      bags: 100,
      closingBags: 30,
      status: 'OPEN',
      mergedIntoGrnNumber: '0012',
    });
    expect(res.badge).toBe('Merged');
    expect(res.variant).toBe('neutral');
    expect(res.icon).toBe('GitMerge');
    expect(res.mergedReference).toBe('Merged → 0012');
  });

  it('resolves untouched lot with remaining bags as Active', () => {
    const res = resolveGrnLifecycleStatus({
      bags: 100,
      closingBags: 100,
      netDeliveredBags: 0,
      status: 'OPEN',
    });
    expect(res.badge).toBe('Active');
    expect(res.variant).toBe('success');
    expect(res.icon).toBe('CheckCircle2');
  });

  it('resolves partially delivered lot with remaining bags as Partial', () => {
    const res = resolveGrnLifecycleStatus({
      bags: 100,
      closingBags: 60,
      netDeliveredBags: 40,
      status: 'OPEN',
    });
    expect(res.badge).toBe('Partial');
    expect(res.variant).toBe('warning');
    expect(res.icon).toBe('Clock');
  });
});
