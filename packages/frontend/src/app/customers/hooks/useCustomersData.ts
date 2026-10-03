'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Customer } from '@cold-storage/contracts';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';

export function useCustomersData() {
  const { selectedFacilityId } = useFacility();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = selectedFacilityId
        ? `/api/customers?facilityId=${encodeURIComponent(selectedFacilityId)}`
        : '/api/customers';
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: Customer[] };
      setCustomers(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(term));
  }, [customers, searchTerm]);

  return {
    customers,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    filteredCustomers,
    fetchCustomers,
  };
}
