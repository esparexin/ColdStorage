'use client';

import React, { useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { can, type Role } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { FacilityModal } from './components/FacilityModal';
import { PositionOccupancyPanel } from './components/PositionOccupancyPanel';
import { StorageColumnsView } from './components/StorageColumnsView';
import { StorageFacilityBar } from './components/StorageFacilityBar';
import { StorageHierarchyModals } from './components/StorageHierarchyModals';
import { useStorageBrowser } from './hooks/useStorageBrowser';
import { useStorageMutations } from './hooks/useStorageMutations';
import styles from './page.module.css';

export default function StorageHierarchyPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities, setSelectedFacilityId, refreshFacilities } =
    useFacility();

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canView = can(userRole, 'storage:view');
  const canManage = can(userRole, 'storage:manage');

  const [facilityModalOpen, setFacilityModalOpen] = useState(false);
  const [facilityModalMode, setFacilityModalMode] = useState<'create' | 'edit'>('create');

  const browser = useStorageBrowser(selectedFacilityId, canView);
  const mutations = useStorageMutations(
    selectedFacilityId, browser.selectedChamber, browser.selectedRack, browser.selectedLevel,
    browser.racks, browser.levels, browser.positions,
    () => void browser.fetchChambers(), (chId) => void browser.fetchRacks(chId),
    (rkId) => void browser.fetchLevels(rkId), (lvlId) => void browser.fetchPositions(lvlId),
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
          <Button
            variant="outline"
            onClick={() => void browser.fetchChambers()}
            disabled={browser.loadingChambers}
            aria-label="Refresh hierarchy"
            leftIcon={<RefreshCw size={16} className={browser.loadingChambers ? styles.spinning : ''} />}
          >
            Refresh
          </Button>
        </div>
      </header>

      {mutations.actionSuccess && (
        <div className={styles.bannerSuccess} role="status">
          <CheckCircle2 size={16} style={{ display: 'inline', marginRight: 8 }} />
          <span>{mutations.actionSuccess}</span>
        </div>
      )}

      <StorageFacilityBar
        selectedFacilityId={selectedFacilityId}
        availableFacilities={availableFacilities}
        canManage={canManage}
        currentFacility={currentFacility}
        selectedChamber={browser.selectedChamber}
        selectedRack={browser.selectedRack}
        selectedLevel={browser.selectedLevel}
        selectedPosition={browser.selectedPosition}
        onSelectFacility={setSelectedFacilityId}
        onCreateFacility={() => {
          setFacilityModalMode('create');
          setFacilityModalOpen(true);
        }}
        onEditFacility={() => {
          setFacilityModalMode('edit');
          setFacilityModalOpen(true);
        }}
      />

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
        onEditChamber={mutations.openEditChamber}
        onDeactivateChamber={(c) => mutations.handleDeactivate('chamber', c.id, `Chamber ${c.chamberNumber}`)}
        onEditRack={mutations.openEditRack}
        onDeactivateRack={(r) => mutations.handleDeactivate('rack', r.id, `Rack ${r.code}`)}
        onEditLevel={mutations.openEditLevel}
        onDeactivateLevel={(l) => mutations.handleDeactivate('level', l.id, `Level ${l.code}`)}
        onEditPosition={mutations.openEditPosition}
        onDeactivatePosition={(p) => mutations.handleDeactivate('position', p.id, `Rack Space ${p.code}`)}
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
        modalMode={mutations.modalMode}
        onClose={() => mutations.setActiveModal(null)}
        selectedChamber={browser.selectedChamber}
        selectedRack={browser.selectedRack}
        selectedLevel={browser.selectedLevel}
        onSubmit={mutations.handleSaveSubmit}
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

      <FacilityModal
        isOpen={facilityModalOpen}
        mode={facilityModalMode}
        facilityId={selectedFacilityId}
        initialCode={currentFacility?.code}
        initialName={currentFacility?.name}
        onClose={() => setFacilityModalOpen(false)}
        onSuccess={async (msg, newFacId) => {
          mutations.setActionSuccess(msg);
          await refreshFacilities();
          if (newFacId) setSelectedFacilityId(newFacId);
        }}
      />
    </div>
  );
}
