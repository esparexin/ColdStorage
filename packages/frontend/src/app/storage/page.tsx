'use client';

import React from 'react';
import {
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  ShieldAlert,
  Warehouse,
} from 'lucide-react';
import { can, type Role } from '@cold-storage/contracts';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { PositionOccupancyPanel } from './components/PositionOccupancyPanel';
import { StorageColumnsView } from './components/StorageColumnsView';
import { StorageHierarchyModals } from './components/StorageHierarchyModals';
import { useStorageBrowser } from './hooks/useStorageBrowser';
import { useStorageMutations } from './hooks/useStorageMutations';
import styles from './page.module.css';

export default function StorageHierarchyPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities, setSelectedFacilityId } = useFacility();

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canView = can(userRole, 'storage:view');
  const canManage = can(userRole, 'storage:manage');

  const browser = useStorageBrowser(selectedFacilityId, canView);
  const mutations = useStorageMutations(
    selectedFacilityId,
    browser.selectedChamber,
    browser.selectedRack,
    browser.selectedLevel,
    browser.racks,
    browser.levels,
    browser.positions,
    () => void browser.fetchChambers(),
    (chId) => void browser.fetchRacks(chId),
    (rkId) => void browser.fetchLevels(rkId),
    (lvlId) => void browser.fetchPositions(lvlId),
  );

  if (!canView) {
    return (
      <div className={styles.container}>
        <div className={styles.unauthorizedWrapper}>
          <ShieldAlert size={48} color="var(--color-danger)" />
          <h2>Restricted Access</h2>
          <p className={styles.subtitle}>
            You lack permission to view the warehouse storage hierarchy.
          </p>
        </div>
      </div>
    );
  }

  const currentFacility = availableFacilities.find((f) => f.id === selectedFacilityId);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Storage Hierarchy & Occupancy</h1>
          <p className={styles.subtitle}>
            Facility-scoped multi-tier layout: Facility → Chamber → Rack → Level → Rack Space with live
            occupancy calculation.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void browser.fetchChambers()}
            disabled={browser.loadingChambers}
            aria-label="Refresh hierarchy"
          >
            <RefreshCw size={16} className={browser.loadingChambers ? styles.spinning : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {mutations.actionSuccess && (
        <div className={styles.bannerSuccess} role="status">
          <CheckCircle2 size={16} style={{ display: 'inline', marginRight: 8 }} />
          <span>{mutations.actionSuccess}</span>
        </div>
      )}

      <div className={styles.facilitySelectCard}>
        <div className={styles.facilitySelectLeft}>
          <Warehouse size={20} color="var(--color-primary)" />
          <label htmlFor="facility-selector">Warehouse Facility:</label>
          <select
            id="facility-selector"
            className={styles.selectInput}
            value={selectedFacilityId || ''}
            onChange={(e) => setSelectedFacilityId(e.target.value)}
          >
            {availableFacilities.map((fac) => (
              <option key={fac.id} value={fac.id}>
                {fac.name} ({fac.code})
              </option>
            ))}
          </select>
        </div>
        <div className={styles.breadcrumbs} aria-label="Hierarchy Path">
          <span>{currentFacility?.name || 'Facility'}</span>
          {browser.selectedChamber && (
            <>
              <ChevronRight size={14} />
              <span className={!browser.selectedRack ? styles.breadcrumbActive : undefined}>
                Chamber {browser.selectedChamber.chamberNumber}
              </span>
            </>
          )}
          {browser.selectedRack && (
            <>
              <ChevronRight size={14} />
              <span className={!browser.selectedLevel ? styles.breadcrumbActive : undefined}>
                Rack {browser.selectedRack.code}
              </span>
            </>
          )}
          {browser.selectedLevel && (
            <>
              <ChevronRight size={14} />
              <span className={!browser.selectedPosition ? styles.breadcrumbActive : undefined}>
                Level {browser.selectedLevel.code}
              </span>
            </>
          )}
          {browser.selectedPosition && (
            <>
              <ChevronRight size={14} />
              <span className={styles.breadcrumbActive}>Space {browser.selectedPosition.code}</span>
            </>
          )}
        </div>
      </div>

      <StorageColumnsView
        chambers={browser.chambers}
        selectedChamber={browser.selectedChamber}
        onSelectChamber={browser.handleSelectChamber}
        racks={browser.racks}
        selectedRack={browser.selectedRack}
        onSelectRack={browser.handleSelectRack}
        levels={browser.levels}
        selectedLevel={browser.selectedLevel}
        onSelectLevel={browser.handleSelectLevel}
        positions={browser.positions}
        selectedPosition={browser.selectedPosition}
        onSelectPosition={browser.handleSelectPosition}
        canManage={canManage}
        onOpenModal={mutations.openCreateModal}
        loadingChambers={browser.loadingChambers}
        loadingRacks={browser.loadingRacks}
        loadingLevels={browser.loadingLevels}
        loadingPositions={browser.loadingPositions}
      />

      <PositionOccupancyPanel
        positionCode={browser.selectedPosition?.code}
        occupancy={browser.positionOccupancy}
        loading={browser.loadingOccupancy}
      />

      <StorageHierarchyModals
        activeModal={mutations.activeModal}
        onClose={() => mutations.setActiveModal(null)}
        selectedChamber={browser.selectedChamber}
        selectedRack={browser.selectedRack}
        selectedLevel={browser.selectedLevel}
        onSubmit={mutations.handleCreateSubmit}
        submitting={mutations.submitting}
        formError={mutations.formError}
        chamberNumber={mutations.chamberNumber}
        setChamberNumber={mutations.setChamberNumber}
        chamberName={mutations.chamberName}
        setChamberName={mutations.setChamberName}
        rackCode={mutations.rackCode}
        setRackCode={mutations.setRackCode}
        levelNumber={mutations.levelNumber}
        setLevelNumber={mutations.setLevelNumber}
        levelCode={mutations.levelCode}
        setLevelCode={mutations.setLevelCode}
        positionCode={mutations.positionCode}
        setPositionCode={mutations.setPositionCode}
        capacityBags={mutations.capacityBags}
        setCapacityBags={mutations.setCapacityBags}
      />
    </div>
  );
}
