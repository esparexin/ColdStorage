import { useState } from 'react';
import type { Chamber, Level, Rack } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import type { ModalType } from '../types';

export function useStorageMutations(
  selectedFacilityId: string | null,
  selectedChamber: Chamber | null,
  selectedRack: Rack | null,
  selectedLevel: Level | null,
  onRefreshChambers: () => void,
  onRefreshRacks: (chamberId: string) => void,
  onRefreshLevels: (rackId: string) => void,
  onRefreshPositions: (levelId: string) => void,
) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [chamberNumber, setChamberNumber] = useState('');
  const [chamberName, setChamberName] = useState('');
  const [rackCode, setRackCode] = useState('');
  const [levelNumber, setLevelNumber] = useState('1');
  const [levelCode, setLevelCode] = useState('');
  const [positionCode, setPositionCode] = useState('');
  const [capacityBags, setCapacityBags] = useState('100');

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId) return;
    setFormError(null);
    setSubmitting(true);

    try {
      if (activeModal === 'chamber') {
        if (!chamberNumber.trim()) throw new Error('Chamber number is required.');
        const res = await requestWithAuth(`/api/facilities/${selectedFacilityId}/chambers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chamberNumber: chamberNumber.trim(),
            name: chamberName.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error || 'Failed to create chamber');
        }
        setActionSuccess(`Chamber "${chamberNumber}" created successfully.`);
        setActiveModal(null);
        setChamberNumber('');
        setChamberName('');
        onRefreshChambers();
      } else if (activeModal === 'rack') {
        if (!selectedChamber) throw new Error('Please select a parent chamber.');
        if (!rackCode.trim()) throw new Error('Rack code is required.');
        const res = await requestWithAuth(`/api/chambers/${selectedChamber.id}/racks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: rackCode.trim() }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error || 'Failed to create rack');
        }
        setActionSuccess(`Rack "${rackCode}" created successfully.`);
        setActiveModal(null);
        setRackCode('');
        onRefreshRacks(selectedChamber.id);
      } else if (activeModal === 'level') {
        if (!selectedRack) throw new Error('Please select a parent rack.');
        if (!levelCode.trim()) throw new Error('Level code is required.');
        const parsedNum = parseInt(levelNumber, 10);
        if (isNaN(parsedNum) || parsedNum < 1) throw new Error('Level number must be at least 1.');
        const res = await requestWithAuth(`/api/racks/${selectedRack.id}/levels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: levelCode.trim(), levelNumber: parsedNum }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error || 'Failed to create level');
        }
        setActionSuccess(`Level "${levelCode}" created successfully.`);
        setActiveModal(null);
        setLevelCode('');
        setLevelNumber('1');
        onRefreshLevels(selectedRack.id);
      } else if (activeModal === 'position') {
        if (!selectedLevel) throw new Error('Please select a parent level.');
        if (!positionCode.trim()) throw new Error('Position code is required.');
        const parsedCap = parseInt(capacityBags, 10);
        if (isNaN(parsedCap) || parsedCap < 1)
          throw new Error('Capacity bags must be a positive integer.');
        const res = await requestWithAuth(`/api/levels/${selectedLevel.id}/positions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: positionCode.trim(), capacityBags: parsedCap }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error || 'Failed to create position');
        }
        setActionSuccess(`Position "${positionCode}" created successfully.`);
        setActiveModal(null);
        setPositionCode('');
        setCapacityBags('100');
        onRefreshPositions(selectedLevel.id);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    activeModal,
    setActiveModal,
    submitting,
    formError,
    setFormError,
    actionSuccess,
    setActionSuccess,
    chamberNumber,
    setChamberNumber,
    chamberName,
    setChamberName,
    rackCode,
    setRackCode,
    levelNumber,
    setLevelNumber,
    levelCode,
    setLevelCode,
    positionCode,
    setPositionCode,
    capacityBags,
    setCapacityBags,
    handleCreateSubmit,
  };
}
