import { describe, expect, it } from 'vitest';
import type { Customer } from '@cold-storage/contracts';
import { resolveCandidateTransferees } from '../transferCandidateCustomer.helper';

describe('resolveCandidateTransferees', () => {
  const currentOwner: Customer = {
    id: 'cust-owner',
    name: 'Current Owner',
    isActive: true,
    facilityIds: ['fac-1'],
  };

  const inactiveCustomer: Customer = {
    id: 'cust-inactive',
    name: 'Inactive Customer',
    isActive: false,
    facilityIds: ['fac-1'],
  };

  const eligibleCustomer1: Customer = {
    id: 'cust-eligible-1',
    name: 'Transferee Customer A',
    isActive: true,
    facilityIds: ['fac-1'],
  };

  const eligibleCustomer2: Customer = {
    id: 'cust-eligible-2',
    name: 'Transferee Customer B',
    isActive: true,
    facilityIds: ['fac-1'],
  };

  it('excludes current owner from candidates to prevent self-transfer', () => {
    const list = [currentOwner, eligibleCustomer1, eligibleCustomer2];
    const candidates = resolveCandidateTransferees(list, currentOwner.id);
    expect(candidates.find((c) => c.id === currentOwner.id)).toBeUndefined();
    expect(candidates.length).toBe(2);
  });

  it('excludes inactive customers from candidates', () => {
    const list = [currentOwner, inactiveCustomer, eligibleCustomer1];
    const candidates = resolveCandidateTransferees(list, currentOwner.id);
    expect(candidates.find((c) => c.id === inactiveCustomer.id)).toBeUndefined();
    expect(candidates.length).toBe(1);
    expect(candidates[0]?.id).toBe(eligibleCustomer1.id);
  });

  it('merges freshly created customers and dedupes existing IDs', () => {
    const list = [eligibleCustomer1];
    const newCustomer: Customer = {
      id: 'cust-newly-added',
      name: 'Newly Registered Customer',
      isActive: true,
      facilityIds: ['fac-1'],
    };

    const duplicateCustomer: Customer = {
      id: 'cust-eligible-1',
      name: 'Transferee Customer A (Dup)',
      isActive: true,
      facilityIds: ['fac-1'],
    };

    const candidates = resolveCandidateTransferees(list, currentOwner.id, [newCustomer, duplicateCustomer]);
    expect(candidates.length).toBe(2);
    expect(candidates.find((c) => c.id === 'cust-newly-added')).toBeDefined();
    expect(candidates.find((c) => c.id === 'cust-eligible-1')?.name).toBe('Transferee Customer A');
  });

  it('handles 100+ customers effectively', () => {
    const manyCustomers: Customer[] = Array.from({ length: 150 }, (_, idx) => ({
      id: `cust-${idx}`,
      name: `Customer ${idx}`,
      isActive: idx % 10 !== 0, // every 10th is inactive
      facilityIds: ['fac-1'],
    }));

    manyCustomers.push(currentOwner);

    const candidates = resolveCandidateTransferees(manyCustomers, currentOwner.id);
    // 150 customers minus 15 inactive = 135 active; minus current owner (if not in 150, but it was appended) = 135
    expect(candidates.find((c) => c.id === currentOwner.id)).toBeUndefined();
    expect(candidates.every((c) => c.isActive)).toBe(true);
  });
});

