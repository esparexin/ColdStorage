import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Commodity,
  Customer,
  Grn,
  GrnStatus,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useGrns(
  selectedFacilityId: string | null,
  availableFacilities: Array<{ id: string; name: string }>,
) {
  const [grns, setGrns] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lookups
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [commodities, setCommodities] = useState<Commodity[]>([]);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | GrnStatus>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [commodityFilter, setCommodityFilter] = useState('');

  // Fetch Lookups
  const fetchLookups = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      const [custRes, commRes] = await Promise.all([
        requestWithAuth(`/api/customers?facilityId=${encodeURIComponent(selectedFacilityId)}`),
        requestWithAuth('/api/commodities'),
      ]);

      if (custRes.ok) {
        const data = (await custRes.json()) as { items?: Customer[] };
        setCustomers((data.items ?? []).filter((c) => c.isActive));
      }
      if (commRes.ok) {
        const data = (await commRes.json()) as { items?: Commodity[] };
        setCommodities((data.items ?? []).filter((c) => c.isActive));
      }
    } catch {
      // Lookups fail gracefully without halting UI
    }
  }, [selectedFacilityId]);

  // Fetch GRNs
  const fetchGrns = useCallback(async () => {
    if (!selectedFacilityId) {
      setGrns([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (statusFilter) params.set('status', statusFilter);
      if (customerFilter) params.set('customerId', customerFilter);
      if (commodityFilter) params.set('commodityId', commodityFilter);

      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?${params.toString()}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: Grn[] };
      setGrns(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Goods Receipt Notes');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId, statusFilter, customerFilter, commodityFilter]);

  useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    void fetchGrns();
  }, [fetchGrns]);

  // Filtered in-memory records
  const filteredGrns = useMemo(() => {
    if (!searchTerm.trim()) return grns;
    const term = searchTerm.toLowerCase();
    return grns.filter((g) => {
      const matchGrn = g.grnNumber.toLowerCase().includes(term);
      const matchReceipt = g.inwardReceiptNumber.toLowerCase().includes(term);
      const matchCustomer = g.customerName.toLowerCase().includes(term);
      const matchCommodity = g.commodityName.toLowerCase().includes(term);
      const matchGp = g.gpNumber?.toLowerCase().includes(term) ?? false;
      const matchVehicle = g.vehicleNumber?.toLowerCase().includes(term) ?? false;
      return matchGrn || matchReceipt || matchCustomer || matchCommodity || matchGp || matchVehicle;
    });
  }, [grns, searchTerm]);

  const currentFacilityName = useMemo(() => {
    return (
      availableFacilities.find((f) => f.id === selectedFacilityId)?.name ??
      selectedFacilityId ??
      ''
    );
  }, [availableFacilities, selectedFacilityId]);

  const resetFilters = () => {
    setStatusFilter('');
    setCustomerFilter('');
    setCommodityFilter('');
    setSearchTerm('');
  };

  return {
    grns,
    filteredGrns,
    loading,
    error,
    customers,
    commodities,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    customerFilter,
    setCustomerFilter,
    commodityFilter,
    setCommodityFilter,
    currentFacilityName,
    fetchGrns,
    fetchLookups,
    resetFilters,
  };
}
