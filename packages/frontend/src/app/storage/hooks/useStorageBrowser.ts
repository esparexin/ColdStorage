import { useCallback, useEffect, useState } from 'react';
import type { Chamber, Level, Position, PositionOccupancy, Rack } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useStorageBrowser(selectedFacilityId: string | null, canView: boolean) {
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [selectedChamber, setSelectedChamber] = useState<Chamber | null>(null);

  const [racks, setRacks] = useState<Rack[]>([]);
  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);

  const [levels, setLevels] = useState<Level[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);

  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  const [positionOccupancy, setPositionOccupancy] = useState<PositionOccupancy | null>(null);
  const [loadingOccupancy, setLoadingOccupancy] = useState(false);

  const [loadingChambers, setLoadingChambers] = useState(false);
  const [loadingRacks, setLoadingRacks] = useState(false);
  const [loadingLevels, setLoadingLevels] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);

  const fetchChambers = useCallback(async () => {
    if (!selectedFacilityId || !canView) return;
    setLoadingChambers(true);
    setSelectedChamber(null);
    setRacks([]);
    setSelectedRack(null);
    setLevels([]);
    setSelectedLevel(null);
    setPositions([]);
    setSelectedPosition(null);
    setPositionOccupancy(null);

    try {
      const res = await requestWithAuth(`/api/facilities/${selectedFacilityId}/chambers`);
      if (res.ok) {
        const data = (await res.json()) as { items?: Chamber[] };
        setChambers(data.items || []);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingChambers(false);
    }
  }, [selectedFacilityId, canView]);

  const fetchRacks = useCallback(
    async (chamberId: string) => {
      if (!canView) return;
      setLoadingRacks(true);
      setSelectedRack(null);
      setLevels([]);
      setSelectedLevel(null);
      setPositions([]);
      setSelectedPosition(null);
      setPositionOccupancy(null);

      try {
        const res = await requestWithAuth(`/api/chambers/${chamberId}/racks`);
        if (res.ok) {
          const data = (await res.json()) as { items?: Rack[] };
          setRacks(data.items || []);
        }
      } catch {
        // Handled silently
      } finally {
        setLoadingRacks(false);
      }
    },
    [canView],
  );

  const fetchLevels = useCallback(
    async (rackId: string) => {
      if (!canView) return;
      setLoadingLevels(true);
      setSelectedLevel(null);
      setPositions([]);
      setSelectedPosition(null);
      setPositionOccupancy(null);

      try {
        const res = await requestWithAuth(`/api/racks/${rackId}/levels`);
        if (res.ok) {
          const data = (await res.json()) as { items?: Level[] };
          setLevels(data.items || []);
        }
      } catch {
        // Handled silently
      } finally {
        setLoadingLevels(false);
      }
    },
    [canView],
  );

  const fetchPositions = useCallback(
    async (levelId: string) => {
      if (!canView) return;
      setLoadingPositions(true);
      setSelectedPosition(null);
      setPositionOccupancy(null);

      try {
        const res = await requestWithAuth(`/api/levels/${levelId}/positions`);
        if (res.ok) {
          const data = (await res.json()) as { items?: Position[] };
          setPositions(data.items || []);
        }
      } catch {
        // Handled silently
      } finally {
        setLoadingPositions(false);
      }
    },
    [canView],
  );

  const fetchOccupancy = useCallback(
    async (positionId: string) => {
      if (!selectedFacilityId || !canView) return;
      setLoadingOccupancy(true);
      try {
        const res = await requestWithAuth(
          `/api/facilities/${selectedFacilityId}/positions/${positionId}/occupancy`,
        );
        if (res.ok) {
          const data = (await res.json()) as { occupancy?: PositionOccupancy };
          setPositionOccupancy(data.occupancy || null);
        }
      } catch {
        // Handled silently
      } finally {
        setLoadingOccupancy(false);
      }
    },
    [selectedFacilityId, canView],
  );

  useEffect(() => {
    void fetchChambers();
  }, [fetchChambers]);

  const handleSelectChamber = (chamber: Chamber) => {
    setSelectedChamber(chamber);
    void fetchRacks(chamber.id);
  };

  const handleSelectRack = (rack: Rack) => {
    setSelectedRack(rack);
    void fetchLevels(rack.id);
  };

  const handleSelectLevel = (level: Level) => {
    setSelectedLevel(level);
    void fetchPositions(level.id);
  };

  const handleSelectPosition = (pos: Position) => {
    setSelectedPosition(pos);
    void fetchOccupancy(pos.id);
  };

  return {
    chambers,
    selectedChamber,
    racks,
    selectedRack,
    levels,
    selectedLevel,
    positions,
    selectedPosition,
    positionOccupancy,
    loadingChambers,
    loadingRacks,
    loadingLevels,
    loadingPositions,
    loadingOccupancy,
    fetchChambers,
    fetchRacks,
    fetchLevels,
    fetchPositions,
    fetchOccupancy,
    handleSelectChamber,
    handleSelectRack,
    handleSelectLevel,
    handleSelectPosition,
  };
}
