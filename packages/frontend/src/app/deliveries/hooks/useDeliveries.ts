import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeliveryChallan, DeliveryStatus } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useDeliveries(
  selectedFacilityId: string | null,
  availableFacilities: Array<{ id: string; name: string }>,
) {
  const [deliveries, setDeliveries] = useState<DeliveryChallan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | DeliveryStatus>('');

  const fetchDeliveries = useCallback(async () => {
    if (!selectedFacilityId) {
      setDeliveries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (statusFilter) params.set('status', statusFilter);

      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/deliveries?${params.toString()}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: DeliveryChallan[] };
      setDeliveries(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId, statusFilter]);

  useEffect(() => {
    void fetchDeliveries();
  }, [fetchDeliveries]);

  const filteredDeliveries = useMemo(() => {
    if (!searchTerm.trim()) return deliveries;
    const term = searchTerm.toLowerCase();
    return deliveries.filter((d) => {
      const matchChallan = d.challanNumber.toLowerCase().includes(term);
      const matchGrn = d.grnNumber.toLowerCase().includes(term);
      const matchCust = d.customerName.toLowerCase().includes(term);
      const matchComm = d.commodityName.toLowerCase().includes(term);
      const matchVeh = d.vehicleNumber?.toLowerCase().includes(term) ?? false;
      const matchDriver = d.driverName?.toLowerCase().includes(term) ?? false;
      return matchChallan || matchGrn || matchCust || matchComm || matchVeh || matchDriver;
    });
  }, [deliveries, searchTerm]);

  const currentFacilityName = useMemo(() => {
    return (
      availableFacilities.find((f) => f.id === selectedFacilityId)?.name ??
      selectedFacilityId ??
      ''
    );
  }, [availableFacilities, selectedFacilityId]);

  const resetFilters = () => {
    setStatusFilter('');
    setSearchTerm('');
  };

  return {
    deliveries,
    filteredDeliveries,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    currentFacilityName,
    fetchDeliveries,
    resetFilters,
  };
}
