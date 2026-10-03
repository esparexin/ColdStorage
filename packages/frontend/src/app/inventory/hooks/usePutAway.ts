import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  GrnInventorySummary,
  Level,
  Position,
  PutAwayAllocation,
  Rack,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import {
  createAllocRow,
  isAllocValidationFailure,
  patchAllocRow,
  validateAllocRows,
} from '../alloc-rows.helper';
import type { AllocatingRow } from '../types';

export function usePutAway(
  selectedFacilityId: string | null,
  initialGrnId: string | null,
  onAllocationSuccess?: () => void,
) {
  const [selectedGrnId, setSelectedGrnId] = useState<string | null>(initialGrnId);
  const [grnSummary, setGrnSummary] = useState<GrnInventorySummary | null>(null);
  const [pastAllocations, setPastAllocations] = useState<PutAwayAllocation[]>([]);
  const [loadingGrnDetails, setLoadingGrnDetails] = useState(false);

  const [chamberRacks, setChamberRacks] = useState<Rack[]>([]);
  const [rackLevels, setRackLevels] = useState<Record<string, Level[]>>({});
  const [levelPositions, setLevelPositions] = useState<Record<string, Position[]>>({});

  const [allocRows, setAllocRows] = useState<AllocatingRow[]>([
    createAllocRow('row-1'),
  ]);
  const [allocNotes, setAllocNotes] = useState('');
  const [allocSubmitting, setAllocSubmitting] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);
  const [rentBlocked, setRentBlocked] = useState<{
    grnId: string;
    grnNumber: string;
    rentAmount: number;
    totalPaid: number;
    remainingBalance: number;
  } | null>(null);

  const clearRentBlock = useCallback(() => {
    setRentBlocked(null);
  }, []);

  const fetchGrnSummaryAndHistory = useCallback(
    async (grnId: string) => {
      if (!selectedFacilityId || !grnId) return;
      setLoadingGrnDetails(true);
      setAllocError(null);
      setRentBlocked(null);
      try {
        const [sumRes, allocRes] = await Promise.all([
          requestWithAuth(
            `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(grnId)}/inventory-summary`,
          ),
          requestWithAuth(
            `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(grnId)}/allocations`,
          ),
        ]);

        if (sumRes.ok) {
          const data = (await sumRes.json()) as { summary: GrnInventorySummary };
          setGrnSummary(data.summary);

          const racksRes = await requestWithAuth(
            `/api/chambers/${encodeURIComponent(data.summary.chamberId)}/racks`,
          );
          if (racksRes.ok) {
            const racksData = (await racksRes.json()) as { items?: Rack[] };
            setChamberRacks((racksData.items ?? []).filter((r) => r.isActive));
          }
        }

        if (allocRes.ok) {
          const allocData = (await allocRes.json()) as { allocations?: PutAwayAllocation[] };
          setPastAllocations(allocData.allocations ?? []);
        }
      } catch (err: unknown) {
        setAllocError(err instanceof Error ? err.message : 'Failed to load GRN inventory details');
      } finally {
        setLoadingGrnDetails(false);
      }
    },
    [selectedFacilityId],
  );

  useEffect(() => {
    if (selectedGrnId) {
      void fetchGrnSummaryAndHistory(selectedGrnId);
      setAllocRows([createAllocRow('row-1')]);
    }
  }, [selectedGrnId, fetchGrnSummaryAndHistory]);

  const handleAllocRackChange = async (rowId: string, rackId: string) => {
    setAllocRows((rows) => patchAllocRow(rows, rowId, { rackId, levelId: '', positionId: '' }));

    if (rackId && !rackLevels[rackId]) {
      try {
        const res = await requestWithAuth(`/api/racks/${encodeURIComponent(rackId)}/levels`);
        if (res.ok) {
          const data = (await res.json()) as { items?: Level[] };
          setRackLevels((prev) => ({
            ...prev,
            [rackId]: (data.items ?? []).filter((l) => l.isActive),
          }));
        }
      } catch {
        // Graceful
      }
    }
  };

  const handleAllocLevelChange = async (rowId: string, levelId: string) => {
    setAllocRows((rows) => patchAllocRow(rows, rowId, { levelId, positionId: '' }));

    if (levelId && !levelPositions[levelId]) {
      try {
        const res = await requestWithAuth(`/api/levels/${encodeURIComponent(levelId)}/positions`);
        if (res.ok) {
          const data = (await res.json()) as { items?: Position[] };
          setLevelPositions((prev) => ({
            ...prev,
            [levelId]: (data.items ?? []).filter((p) => p.isActive),
          }));
        }
      } catch {
        // Graceful
      }
    }
  };

  const handleAllocPositionChange = (rowId: string, positionId: string) => {
    setAllocRows((rows) => patchAllocRow(rows, rowId, { positionId }));
  };

  const handleAllocBagsChange = (rowId: string, bags: string) => {
    setAllocRows((rows) =>
      patchAllocRow(rows, rowId, { bags: bags.trim() === '' ? '' : Number.parseInt(bags, 10) }),
    );
  };

  const handleAddAllocRow = () => {
    setAllocRows((rows) => [...rows, createAllocRow(`row-${Date.now()}`)]);
  };

  const handleRemoveAllocRow = (id: string) => {
    setAllocRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  };

  const totalAllocatingBags = useMemo(() => {
    return allocRows.reduce((acc, r) => acc + (typeof r.bags === 'number' ? r.bags : 0), 0);
  }, [allocRows]);

  const handlePutAwaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId || !selectedGrnId || !grnSummary) return;

    const validation = validateAllocRows(allocRows, grnSummary.unallocatedBags);
    if (isAllocValidationFailure(validation)) {
      setAllocError(validation.error);
      return;
    }

    setAllocSubmitting(true);
    setAllocError(null);

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(selectedGrnId)}/allocations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: validation.items,
            notes: allocNotes.trim() || undefined,
          }),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as {
          error?: string;
          code?: string;
          rent?: { grnId: string; grnNumber: string; rentAmount: number; totalPaid: number; remainingBalance: number };
        };
        if (res.status === 402 && data.code === 'RENT_PAYMENT_REQUIRED' && data.rent) {
          setRentBlocked(data.rent);
        }
        throw new Error(data.error ?? `Put-away failed with HTTP ${res.status}`);
      }

      setRentBlocked(null);

      setAllocRows([createAllocRow('row-1')]);
      setAllocNotes('');
      void fetchGrnSummaryAndHistory(selectedGrnId);
      if (onAllocationSuccess) onAllocationSuccess();
    } catch (err: unknown) {
      setAllocError(err instanceof Error ? err.message : 'Put-away allocation failed');
    } finally {
      setAllocSubmitting(false);
    }
  };

  return {
    selectedGrnId,
    setSelectedGrnId,
    grnSummary,
    pastAllocations,
    loadingGrnDetails,
    chamberRacks,
    rackLevels,
    levelPositions,
    allocRows,
    allocNotes,
    setAllocNotes,
    allocSubmitting,
    allocError,
    rentBlocked,
    clearRentBlock,
    totalAllocatingBags,
    handleAllocRackChange,
    handleAllocLevelChange,
    handleAllocPositionChange,
    handleAllocBagsChange,
    handleAddAllocRow,
    handleRemoveAllocRow,
    handlePutAwaySubmit,
    fetchGrnSummaryAndHistory,
  };
}
