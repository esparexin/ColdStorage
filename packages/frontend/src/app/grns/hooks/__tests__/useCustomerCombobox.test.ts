import { describe, expect, it } from 'vitest';
import type { Customer } from '@cold-storage/contracts';
import { filterCustomerMatches } from '../useCustomerCombobox';

describe('useCustomerCombobox - filterCustomerMatches', () => {
  // Generate 120 mock customers to simulate real facility customer scale
  const mockCustomers: Customer[] = Array.from({ length: 120 }, (_, idx) => ({
    id: `cust-${idx + 1}`,
    name: idx === 19 ? 'Punnarao V' : idx === 42 ? 'Ramesh Kumar' : `Customer ${idx + 1}`,
    isActive: true,
    facilityIds: ['fac-1'],
  }));

  it('avoids displaying all customers by default when query is empty (showAllByDefault = false)', () => {
    const matches = filterCustomerMatches(mockCustomers, '', false);
    expect(matches).toEqual([]);
    expect(matches.length).toBe(0);
  });

  it('avoids displaying all customers by default when query is only whitespace', () => {
    const matches = filterCustomerMatches(mockCustomers, '   ', false);
    expect(matches).toEqual([]);
  });

  it('returns all customers when showAllByDefault is explicitly true and query is empty', () => {
    const matches = filterCustomerMatches(mockCustomers, '', true);
    expect(matches.length).toBe(120);
  });

  it('filters customers matching search query case-insensitively with 100+ customers', () => {
    const matches = filterCustomerMatches(mockCustomers, 'punna');
    expect(matches.length).toBe(1);
    expect(matches[0]?.name).toBe('Punnarao V');
    expect(matches[0]?.id).toBe('cust-20');
  });

  it('filters customers matching partial uppercase search query', () => {
    const matches = filterCustomerMatches(mockCustomers, 'RAMESH');
    expect(matches.length).toBe(1);
    expect(matches[0]?.name).toBe('Ramesh Kumar');
  });

  it('returns empty array when query does not match any customer', () => {
    const matches = filterCustomerMatches(mockCustomers, 'NonExistentPersonXYZ');
    expect(matches).toEqual([]);
    expect(matches.length).toBe(0);
  });

  it('handles empty customer lists gracefully without crashing', () => {
    const matches = filterCustomerMatches([], 'search', false);
    expect(matches).toEqual([]);
  });
});

