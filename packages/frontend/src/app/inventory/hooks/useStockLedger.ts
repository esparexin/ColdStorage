import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InventoryTransaction } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useStockLedger(selectedFacilityId: string | null) {
  const [ledgerItems, setLedgerItems] = useState<InventoryTransaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('');

  const fetchLedger = useCallback(async () => {
    if (!selectedFacilityId) return;
    setLedgerLoading(true);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/inventory/ledger?limit=100`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: InventoryTransaction[] };
        setLedgerItems(data.items ?? []);
      }
    } catch {
      // Graceful
    } finally {
      setLedgerLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchLedger();
  }, [fetchLedger]);

  const filteredLedger = useMemo(() => {
    return ledgerItems.filter((tx) => {
      const matchSearch =
        !ledgerSearch.trim() ||
        tx.grnNumber.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        tx.chamber.toLowerCase().includes(ledgerSearch.toLowerCase());
      const matchType = !ledgerTypeFilter || tx.transactionType === ledgerTypeFilter;
      return matchSearch && matchType;
    });
  }, [ledgerItems, ledgerSearch, ledgerTypeFilter]);

  return {
    ledgerItems,
    filteredLedger,
    ledgerLoading,
    ledgerSearch,
    setLedgerSearch,
    ledgerTypeFilter,
    setLedgerTypeFilter,
    fetchLedger,
  };
}
