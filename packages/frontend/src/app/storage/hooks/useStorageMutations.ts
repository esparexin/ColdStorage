import { useState } from 'react';
import type { Chamber, Level, Position, Rack } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import type { ModalType } from '../types';

export function useStorageMutations(
  selectedFacilityId: string | null,
  selectedChamber: Chamber | null,
  selectedRack: Rack | null,
  selectedLevel: Level | null,
  racks: Rack[],
  levels: Level[],
  positions: Position[],
  onRefreshChambers: () => void,
  onRefreshRacks: (chamberId: string) => void,
  onRefreshLevels: (rackId: string) => void,
  onRefreshPositions: (levelId: string) => void,
) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const openCreateModal = (type: ModalType) => {
    setFormError(null);
    setActionSuccess(null);
    setModalMode('create');
    setEditingId(null);
    if (type === 'chamber') {
      setChamberNumber('');
      setChamberName('');
    } else if (type === 'rack') {
      const nextCharCode = 65 + racks.length;
      const suggestedCode =
        nextCharCode <= 90 ? String.fromCharCode(nextCharCode) : `R-${racks.length + 1}`;
      setRackCode(suggestedCode);
    } else if (type === 'level') {
      const nextNum = levels.length + 1;
      const rackPrefix = selectedRack ? selectedRack.code.trim().toUpperCase() : 'A';
      setLevelNumber(String(nextNum));
      setLevelCode(`${rackPrefix}${String(nextNum).padStart(2, '0')}`);
    } else if (type === 'position') {
      const nextNum = positions.length + 1;
      const levelPrefix = selectedLevel ? selectedLevel.code.trim() : 'A01';
      setPositionCode(`${levelPrefix}-${String(nextNum).padStart(2, '0')}`);
      setCapacityBags('100');
    }
    setActiveModal(type);
  };

  const openEditChamber = (c: Chamber) => {
    setFormError(null);
    setActionSuccess(null);
    setModalMode('edit');
    setEditingId(c.id);
    setChamberNumber(c.chamberNumber);
    setChamberName(c.name || '');
    setActiveModal('chamber');
  };

  const openEditRack = (r: Rack) => {
    setFormError(null);
    setActionSuccess(null);
    setModalMode('edit');
    setEditingId(r.id);
    setRackCode(r.code);
    setActiveModal('rack');
  };

  const openEditLevel = (l: Level) => {
    setFormError(null);
    setActionSuccess(null);
    setModalMode('edit');
    setEditingId(l.id);
    setLevelNumber(String(l.levelNumber));
    setLevelCode(l.code);
    setActiveModal('level');
  };

  const openEditPosition = (p: Position) => {
    setFormError(null);
    setActionSuccess(null);
    setModalMode('edit');
    setEditingId(p.id);
    setPositionCode(p.code);
    setCapacityBags(String(p.capacityBags));
    setActiveModal('position');
  };

  const handleDeactivate = async (
    type: 'chamber' | 'rack' | 'level' | 'position',
    id: string,
    title: string,
  ) => {
    setFormError(null);
    setActionSuccess(null);
    try {
      const endpoint =
        type === 'chamber'
          ? `/api/chambers/${id}`
          : type === 'rack'
            ? `/api/racks/${id}`
            : type === 'level'
              ? `/api/levels/${id}`
              : `/api/positions/${id}`;

      const res = await requestWithAuth(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || `Failed to deactivate ${title}`);
      }

      setActionSuccess(`${title} deactivated.`);
      if (type === 'chamber') onRefreshChambers();
      else if (type === 'rack' && selectedChamber) onRefreshRacks(selectedChamber.id);
      else if (type === 'level' && selectedRack) onRefreshLevels(selectedRack.id);
      else if (type === 'position' && selectedLevel) onRefreshPositions(selectedLevel.id);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Deactivation failed');
    }
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId) return;
    setFormError(null);
    setSubmitting(true);

    try {
      if (activeModal === 'chamber') {
        if (!chamberNumber.trim()) throw new Error('Chamber number is required.');
        const isEdit = modalMode === 'edit' && editingId;
        const url = isEdit ? `/api/chambers/${editingId}` : `/api/facilities/${selectedFacilityId}/chambers`;
        const res = await requestWithAuth(url, {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chamberNumber: chamberNumber.trim(),
            name: chamberName.trim() || undefined,
          }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Operation failed');
        setActionSuccess(`Chamber "${chamberNumber}" ${isEdit ? 'updated' : 'created'} successfully.`);
        setActiveModal(null);
        onRefreshChambers();
      } else if (activeModal === 'rack') {
        if (!rackCode.trim()) throw new Error('Rack code is required.');
        const isEdit = modalMode === 'edit' && editingId;
        if (!isEdit && !selectedChamber) throw new Error('Please select a parent chamber.');
        const url = isEdit ? `/api/racks/${editingId}` : `/api/chambers/${selectedChamber!.id}/racks`;
        const res = await requestWithAuth(url, {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: rackCode.trim() }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Operation failed');
        setActionSuccess(`Rack "${rackCode}" ${isEdit ? 'updated' : 'created'} successfully.`);
        setActiveModal(null);
        if (selectedChamber) onRefreshRacks(selectedChamber.id);
      } else if (activeModal === 'level') {
        if (!levelCode.trim()) throw new Error('Level code is required.');
        const parsedNum = parseInt(levelNumber, 10);
        if (isNaN(parsedNum) || parsedNum < 1) throw new Error('Level number must be at least 1.');
        const isEdit = modalMode === 'edit' && editingId;
        if (!isEdit && !selectedRack) throw new Error('Please select a parent rack.');
        const url = isEdit ? `/api/levels/${editingId}` : `/api/racks/${selectedRack!.id}/levels`;
        const res = await requestWithAuth(url, {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: levelCode.trim(), levelNumber: parsedNum }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Operation failed');
        setActionSuccess(`Level "${levelCode}" ${isEdit ? 'updated' : 'created'} successfully.`);
        setActiveModal(null);
        if (selectedRack) onRefreshLevels(selectedRack.id);
      } else if (activeModal === 'position') {
        if (!positionCode.trim()) throw new Error('Rack space code is required.');
        const parsedCap = parseInt(capacityBags, 10);
        if (isNaN(parsedCap) || parsedCap < 1) throw new Error('Capacity must be a positive integer.');
        const isEdit = modalMode === 'edit' && editingId;
        if (!isEdit && !selectedLevel) throw new Error('Please select a parent level.');
        const url = isEdit ? `/api/positions/${editingId}` : `/api/levels/${selectedLevel!.id}/positions`;
        const res = await requestWithAuth(url, {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: positionCode.trim(), capacityBags: parsedCap }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Operation failed');
        setActionSuccess(`Rack Space "${positionCode}" ${isEdit ? 'updated' : 'created'} successfully.`);
        setActiveModal(null);
        if (selectedLevel) onRefreshPositions(selectedLevel.id);
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
    modalMode,
    openCreateModal,
    openEditChamber,
    openEditRack,
    openEditLevel,
    openEditPosition,
    handleDeactivate,
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
    handleSaveSubmit,
  };
}
