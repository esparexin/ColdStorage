import { useCallback, useEffect, useState } from 'react';
import type { Chamber, Level, Position, PositionOccupancy, Rack } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useStorageHierarchy(selectedFacilityId: string | null) {
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [activeChamberId, setActiveChamberId] = useState<string | null>(null);
  const [hierarchyRacks, setHierarchyRacks] = useState<Rack[]>([]);
  const [hierarchyLevels, setHierarchyLevels] = useState<Record<string, Level[]>>({});
  const [hierarchyPositions, setHierarchyPositions] = useState<Record<string, Position[]>>({});
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [selectedOccupancy, setSelectedOccupancy] = useState<PositionOccupancy | null>(null);

  const fetchChambers = useCallback(async () => {
    if (!selectedFacilityId) return;
    setLoadingHierarchy(true);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/chambers`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: Chamber[] };
        const chs = (data.items ?? []).filter((c) => c.isActive);
        setChambers(chs);
        if (!activeChamberId && chs.length > 0) {
          setActiveChamberId(chs[0].id);
        }
      }
    } catch {
      // Graceful
    } finally {
      setLoadingHierarchy(false);
    }
  }, [selectedFacilityId, activeChamberId]);

  const fetchChamberHierarchy = useCallback(async (chamberId: string) => {
    if (!chamberId) return;
    try {
      const racksRes = await requestWithAuth(
        `/api/chambers/${encodeURIComponent(chamberId)}/racks`,
      );
      if (!racksRes.ok) return;
      const racksData = (await racksRes.json()) as { items?: Rack[] };
      const racks = (racksData.items ?? []).filter((r) => r.isActive);
      setHierarchyRacks(racks);

      const levelMap: Record<string, Level[]> = {};
      const posMap: Record<string, Position[]> = {};

      await Promise.all(
        racks.map(async (rack) => {
          const lRes = await requestWithAuth(`/api/racks/${encodeURIComponent(rack.id)}/levels`);
          if (lRes.ok) {
            const lData = (await lRes.json()) as { items?: Level[] };
            const levels = (lData.items ?? []).filter((l) => l.isActive);
            levelMap[rack.id] = levels;

            await Promise.all(
              levels.map(async (lvl) => {
                const pRes = await requestWithAuth(
                  `/api/levels/${encodeURIComponent(lvl.id)}/positions`,
                );
                if (pRes.ok) {
                  const pData = (await pRes.json()) as { items?: Position[] };
                  posMap[lvl.id] = (pData.items ?? []).filter((p) => p.isActive);
                }
              }),
            );
          }
        }),
      );

      setHierarchyLevels(levelMap);
      setHierarchyPositions(posMap);
    } catch {
      // Graceful
    }
  }, []);

  useEffect(() => {
    void fetchChambers();
  }, [fetchChambers]);

  useEffect(() => {
    if (activeChamberId) {
      void fetchChamberHierarchy(activeChamberId);
    }
  }, [activeChamberId, fetchChamberHierarchy]);

  return {
    chambers,
    activeChamberId,
    setActiveChamberId,
    hierarchyRacks,
    hierarchyLevels,
    hierarchyPositions,
    loadingHierarchy,
    selectedOccupancy,
    setSelectedOccupancy,
    fetchChambers,
    fetchChamberHierarchy,
  };
}
