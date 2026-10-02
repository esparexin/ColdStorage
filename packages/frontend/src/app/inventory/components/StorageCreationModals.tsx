'use client';

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface StorageCreationModalsProps {
  facilityId: string;
  isAddChamberOpen: boolean;
  onCloseAddChamber: () => void;
  targetChamberForRack: string | null;
  onCloseAddRack: () => void;
  targetLevelForPos: string | null;
  onCloseAddPosition: () => void;
  onHierarchyMutated: () => void;
}

export function StorageCreationModals({
  facilityId,
  isAddChamberOpen,
  onCloseAddChamber,
  targetChamberForRack,
  onCloseAddRack,
  targetLevelForPos,
  onCloseAddPosition,
  onHierarchyMutated,
}: StorageCreationModalsProps) {
  // Chamber Form State
  const [newChamberNum, setNewChamberNum] = useState('');
  const [newChamberName, setNewChamberName] = useState('');
  const [chamberSubmitting, setChamberSubmitting] = useState(false);
  const [chamberError, setChamberError] = useState<string | null>(null);

  // Rack Form State
  const [newRackCode, setNewRackCode] = useState('');
  const [rackSubmitting, setRackSubmitting] = useState(false);
  const [rackError, setRackError] = useState<string | null>(null);

  // Position Form State
  const [newPosCode, setNewPosCode] = useState('');
  const [newPosCapacity, setNewPosCapacity] = useState<number | ''>(500);
  const [posSubmitting, setPosSubmitting] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  const handleAddChamberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityId || !newChamberNum.trim()) return;
    setChamberSubmitting(true);
    setChamberError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/chambers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chamberNumber: newChamberNum.trim(),
            name: newChamberName.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to add chamber');
      }
      setNewChamberNum('');
      setNewChamberName('');
      onCloseAddChamber();
      onHierarchyMutated();
    } catch (err: unknown) {
      setChamberError(err instanceof Error ? err.message : 'Error creating chamber');
    } finally {
      setChamberSubmitting(false);
    }
  };

  const handleAddRackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetChamberForRack || !newRackCode.trim()) return;
    setRackSubmitting(true);
    setRackError(null);
    try {
      const res = await requestWithAuth(
        `/api/chambers/${encodeURIComponent(targetChamberForRack)}/racks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rackCode: newRackCode.trim().toUpperCase() }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to add rack');
      }
      setNewRackCode('');
      onCloseAddRack();
      onHierarchyMutated();
    } catch (err: unknown) {
      setRackError(err instanceof Error ? err.message : 'Error creating rack');
    } finally {
      setRackSubmitting(false);
    }
  };

  const handleAddPositionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLevelForPos || !newPosCode.trim() || typeof newPosCapacity !== 'number') return;
    setPosSubmitting(true);
    setPosError(null);
    try {
      const res = await requestWithAuth(
        `/api/levels/${encodeURIComponent(targetLevelForPos)}/positions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positionCode: newPosCode.trim().toUpperCase(),
            capacityBags: newPosCapacity,
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to add position');
      }
      setNewPosCode('');
      setNewPosCapacity(500);
      onCloseAddPosition();
      onHierarchyMutated();
    } catch (err: unknown) {
      setPosError(err instanceof Error ? err.message : 'Error creating position');
    } finally {
      setPosSubmitting(false);
    }
  };

  return (
    <>
      {/* Add Chamber Modal */}
      {isAddChamberOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add New Chamber</h2>
              <button type="button" className={styles.modalClose} onClick={onCloseAddChamber}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleAddChamberSubmit}>
              <div className={styles.modalBody}>
                {chamberError && <div className={styles.modalError}>{chamberError}</div>}
                <div className={styles.fieldGroup}>
                  <label htmlFor="chamber-num" className={styles.fieldLabel}>Chamber Number / Identifier *</label>
                  <input id="chamber-num" type="text" required maxLength={20} placeholder="e.g. 1" className={styles.fieldInput} value={newChamberNum} onChange={(e) => setNewChamberNum(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="chamber-name" className={styles.fieldLabel}>Chamber Name / Description (Optional)</label>
                  <input id="chamber-name" type="text" maxLength={50} placeholder="e.g. Main Cold Room A" className={styles.fieldInput} value={newChamberName} onChange={(e) => setNewChamberName(e.target.value)} />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={onCloseAddChamber} disabled={chamberSubmitting}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={chamberSubmitting || !newChamberNum.trim()}>
                  <Plus size={15} aria-hidden="true" /> {chamberSubmitting ? 'Creating...' : 'Create Chamber'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Rack Modal */}
      {Boolean(targetChamberForRack) && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add Rack to Chamber</h2>
              <button type="button" className={styles.modalClose} onClick={onCloseAddRack}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleAddRackSubmit}>
              <div className={styles.modalBody}>
                {rackError && <div className={styles.modalError}>{rackError}</div>}
                <div className={styles.fieldGroup}>
                  <label htmlFor="rack-code" className={styles.fieldLabel}>Rack Code *</label>
                  <input id="rack-code" type="text" required maxLength={20} placeholder="e.g. R-01" className={styles.fieldInput} value={newRackCode} onChange={(e) => setNewRackCode(e.target.value.toUpperCase())} />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={onCloseAddRack} disabled={rackSubmitting}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={rackSubmitting || !newRackCode.trim()}>
                  <Plus size={15} aria-hidden="true" /> {rackSubmitting ? 'Creating...' : 'Create Rack'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Position Modal */}
      {Boolean(targetLevelForPos) && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add Position to Level</h2>
              <button type="button" className={styles.modalClose} onClick={onCloseAddPosition}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleAddPositionSubmit}>
              <div className={styles.modalBody}>
                {posError && <div className={styles.modalError}>{posError}</div>}
                <div className={styles.fieldGroup}>
                  <label htmlFor="pos-code" className={styles.fieldLabel}>Position Code *</label>
                  <input id="pos-code" type="text" required maxLength={30} placeholder="e.g. POS-A1" className={styles.fieldInput} value={newPosCode} onChange={(e) => setNewPosCode(e.target.value.toUpperCase())} />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="pos-cap" className={styles.fieldLabel}>Capacity (Bags) *</label>
                  <input id="pos-cap" type="number" required min={1} max={10000} className={styles.fieldInput} value={newPosCapacity} onChange={(e) => setNewPosCapacity(e.target.value ? parseInt(e.target.value, 10) : '')} />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={onCloseAddPosition} disabled={posSubmitting}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={posSubmitting || !newPosCode.trim() || typeof newPosCapacity !== 'number'}>
                  <Plus size={15} aria-hidden="true" /> {posSubmitting ? 'Creating...' : 'Create Position'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
