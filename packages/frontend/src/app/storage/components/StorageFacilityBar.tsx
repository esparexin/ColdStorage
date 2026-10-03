'use client';

import React from 'react';
import { ChevronRight, Edit3, Plus, Warehouse } from 'lucide-react';
import type { Chamber, Level, Position, Rack } from '@cold-storage/contracts';
import { Select } from '@/components/ui';
import type { FacilityOption } from '@/context/FacilityContext';
import styles from '../page.module.css';

interface StorageFacilityBarProps {
  selectedFacilityId: string | null;
  availableFacilities: FacilityOption[];
  canManage: boolean;
  currentFacility: FacilityOption | undefined;
  selectedChamber: Chamber | null;
  selectedRack: Rack | null;
  selectedLevel: Level | null;
  selectedPosition: Position | null;
  onSelectFacility: (facilityId: string) => void;
  onCreateFacility: () => void;
  onEditFacility: () => void;
}

/**
 * Facility selector plus hierarchy breadcrumbs for the storage workspace.
 *
 * Extracted from the route coordinator so `page.tsx` stays a coordinator: this is pure
 * presentation over hierarchy selection state owned by `useStorageBrowser`.
 */
export function StorageFacilityBar({
  selectedFacilityId,
  availableFacilities,
  canManage,
  currentFacility,
  selectedChamber,
  selectedRack,
  selectedLevel,
  selectedPosition,
  onSelectFacility,
  onCreateFacility,
  onEditFacility,
}: StorageFacilityBarProps) {
  return (
    <div className={styles.facilitySelectCard}>
      <div className={styles.facilitySelectLeft}>
        <Warehouse size={20} color="var(--color-primary)" />
        <label htmlFor="storage-facility-selector">Warehouse Facility:</label>
        <Select
          id="storage-facility-selector"
          className={styles.selectInput}
          value={selectedFacilityId || ''}
          onChange={(e) => onSelectFacility(e.target.value)}
        >
          {availableFacilities.map((fac) => (
            <option key={fac.id} value={fac.id}>
              {fac.name} ({fac.code})
            </option>
          ))}
        </Select>
        {canManage && (
          <div className={styles.facilityActions}>
            <button
              type="button"
              className={styles.facilityBtn}
              title="Add Facility"
              aria-label="Add Facility"
              onClick={onCreateFacility}
            >
              <Plus size={13} aria-hidden="true" />
              <span>New Facility</span>
            </button>
            {currentFacility && (
              <button
                type="button"
                className={styles.facilityBtn}
                title="Edit Facility"
                aria-label="Edit Facility"
                onClick={onEditFacility}
              >
                <Edit3 size={13} aria-hidden="true" />
                <span>Edit</span>
              </button>
            )}
          </div>
        )}
      </div>
      <div className={styles.breadcrumbs} aria-label="Hierarchy Path">
        <span>{currentFacility?.name || 'Facility'}</span>
        {selectedChamber && (
          <>
            <ChevronRight size={14} aria-hidden="true" />
            <span className={!selectedRack ? styles.breadcrumbActive : undefined}>
              Chamber {selectedChamber.chamberNumber}
            </span>
          </>
        )}
        {selectedRack && (
          <>
            <ChevronRight size={14} aria-hidden="true" />
            <span className={!selectedLevel ? styles.breadcrumbActive : undefined}>
              Rack {selectedRack.code}
            </span>
          </>
        )}
        {selectedLevel && (
          <>
            <ChevronRight size={14} aria-hidden="true" />
            <span className={!selectedPosition ? styles.breadcrumbActive : undefined}>
              Level {selectedLevel.code}
            </span>
          </>
        )}
        {selectedPosition && (
          <>
            <ChevronRight size={14} aria-hidden="true" />
            <span className={styles.breadcrumbActive}>Space {selectedPosition.code}</span>
          </>
        )}
      </div>
    </div>
  );
}