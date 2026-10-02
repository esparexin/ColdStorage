'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { Chamber, Level, Rack } from '@cold-storage/contracts';
import type { ModalType } from '../types';
import styles from '../page.module.css';

interface StorageHierarchyModalsProps {
  activeModal: ModalType;
  onClose: () => void;
  selectedChamber: Chamber | null;
  selectedRack: Rack | null;
  selectedLevel: Level | null;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  formError: string | null;
  chamberNumber: string;
  setChamberNumber: (val: string) => void;
  chamberName: string;
  setChamberName: (val: string) => void;
  rackCode: string;
  setRackCode: (val: string) => void;
  levelNumber: string;
  setLevelNumber: (val: string) => void;
  levelCode: string;
  setLevelCode: (val: string) => void;
  positionCode: string;
  setPositionCode: (val: string) => void;
  capacityBags: string;
  setCapacityBags: (val: string) => void;
}

export function StorageHierarchyModals({
  activeModal,
  onClose,
  selectedChamber,
  selectedRack,
  selectedLevel,
  onSubmit,
  submitting,
  formError,
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
}: StorageHierarchyModalsProps) {
  if (!activeModal) return null;

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3>
            {activeModal === 'chamber' && 'Add New Chamber'}
            {activeModal === 'rack' && `Add Rack to Chamber ${selectedChamber?.chamberNumber}`}
            {activeModal === 'level' && `Add Level to Rack ${selectedRack?.code}`}
            {activeModal === 'position' && `Add Position to Level ${selectedLevel?.code}`}
          </h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {formError && (
          <div className={styles.bannerError} role="alert">
            {formError}
          </div>
        )}

        <form onSubmit={onSubmit}>
          {activeModal === 'chamber' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="chamberNumber">Chamber Identifier / Number *</label>
                <input
                  id="chamberNumber"
                  type="text"
                  required
                  placeholder="e.g. 1, 2, 3"
                  className={styles.inputField}
                  value={chamberNumber}
                  onChange={(e) => setChamberNumber(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="chamberName">Chamber Name (Optional)</label>
                <input
                  id="chamberName"
                  type="text"
                  placeholder="e.g. Cold Chamber A"
                  className={styles.inputField}
                  value={chamberName}
                  onChange={(e) => setChamberName(e.target.value)}
                />
              </div>
            </>
          )}

          {activeModal === 'rack' && (
            <div className={styles.formGroup}>
              <label htmlFor="rackCode">Rack Code *</label>
              <input
                id="rackCode"
                type="text"
                required
                placeholder="e.g. R-01, R-02"
                className={styles.inputField}
                value={rackCode}
                onChange={(e) => setRackCode(e.target.value)}
              />
            </div>
          )}

          {activeModal === 'level' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="levelNumber">Level Number (Sequential Tier) *</label>
                <input
                  id="levelNumber"
                  type="number"
                  min="1"
                  required
                  className={styles.inputField}
                  value={levelNumber}
                  onChange={(e) => setLevelNumber(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="levelCode">Level Code *</label>
                <input
                  id="levelCode"
                  type="text"
                  required
                  placeholder="e.g. L-01, L-02"
                  className={styles.inputField}
                  value={levelCode}
                  onChange={(e) => setLevelCode(e.target.value)}
                />
              </div>
            </>
          )}

          {activeModal === 'position' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="positionCode">Position Code *</label>
                <input
                  id="positionCode"
                  type="text"
                  required
                  placeholder="e.g. P-01, P-02"
                  className={styles.inputField}
                  value={positionCode}
                  onChange={(e) => setPositionCode(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="capacityBags">Capacity (Bags) *</label>
                <input
                  id="capacityBags"
                  type="number"
                  min="1"
                  required
                  className={styles.inputField}
                  value={capacityBags}
                  onChange={(e) => setCapacityBags(e.target.value)}
                />
              </div>
            </>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
