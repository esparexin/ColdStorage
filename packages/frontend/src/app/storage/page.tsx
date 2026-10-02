'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Layers,
  Package,
  Plus,
  RefreshCw,
  ShieldAlert,
  Warehouse,
  X,
} from 'lucide-react';
import {
  can,
  type Chamber,
  type Level,
  type Position,
  type Rack,
  type Role,
} from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

interface PositionOccupancyResponse {
  positionId: string;
  code: string;
  capacityBags: number;
  occupiedBags: number;
  availableBags: number;
  storedLots: Array<{
    grnId: string;
    grnNumber: string;
    lotNumber: string;
    commodityName: string;
    bags: number;
    customerName: string;
    inwardDate: string;
  }>;
}

type ModalType = 'chamber' | 'rack' | 'level' | 'position' | null;

export default function StorageHierarchyPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities, setSelectedFacilityId } = useFacility();

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canView = can(userRole, 'storage:view');
  const canManage = can(userRole, 'storage:manage');

  // Hierarchy Selection States
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [selectedChamber, setSelectedChamber] = useState<Chamber | null>(null);

  const [racks, setRacks] = useState<Rack[]>([]);
  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);

  const [levels, setLevels] = useState<Level[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);

  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  // Position Occupancy
  const [positionOccupancy, setPositionOccupancy] = useState<PositionOccupancyResponse | null>(null);
  const [loadingOccupancy, setLoadingOccupancy] = useState(false);

  // Loaders
  const [loadingChambers, setLoadingChambers] = useState(false);
  const [loadingRacks, setLoadingRacks] = useState(false);
  const [loadingLevels, setLoadingLevels] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);

  // Modal & Creation
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form Fields
  const [chamberNumber, setChamberNumber] = useState('');
  const [chamberName, setChamberName] = useState('');
  const [rackCode, setRackCode] = useState('');
  const [levelNumber, setLevelNumber] = useState('1');
  const [levelCode, setLevelCode] = useState('');
  const [positionCode, setPositionCode] = useState('');
  const [capacityBags, setCapacityBags] = useState('100');

  // Load Chambers for selected facility
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

  // Load Racks for selected chamber
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

  // Load Levels for selected rack
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

  // Load Positions for selected level
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

  // Load Position Occupancy
  const fetchOccupancy = useCallback(
    async (positionId: string) => {
      if (!selectedFacilityId || !canView) return;
      setLoadingOccupancy(true);
      try {
        const res = await requestWithAuth(
          `/api/facilities/${selectedFacilityId}/positions/${positionId}/occupancy`,
        );
        if (res.ok) {
          const data = (await res.json()) as { occupancy?: PositionOccupancyResponse };
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

  // Selections
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

  // Form Submissions
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
        void fetchChambers();
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
        void fetchRacks(selectedChamber.id);
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
        void fetchLevels(selectedRack.id);
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
        void fetchPositions(selectedLevel.id);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

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
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Storage Hierarchy & Occupancy</h1>
          <p className={styles.subtitle}>
            Facility-scoped multi-tier layout: Facility → Chamber → Rack → Level → Position with live
            occupancy calculation.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void fetchChambers()}
            disabled={loadingChambers}
            aria-label="Refresh hierarchy"
          >
            <RefreshCw size={16} className={loadingChambers ? styles.spinning : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Notifications */}
      {actionSuccess && (
        <div className={styles.bannerSuccess} role="status">
          <CheckCircle2 size={16} style={{ display: 'inline', marginRight: 8 }} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Facility Selector Card */}
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
        {/* Breadcrumb path */}
        <div className={styles.breadcrumbs} aria-label="Hierarchy Path">
          <span>{currentFacility?.name || 'Facility'}</span>
          {selectedChamber && (
            <>
              <ChevronRight size={14} />
              <span className={!selectedRack ? styles.breadcrumbActive : undefined}>
                Chamber {selectedChamber.chamberNumber}
              </span>
            </>
          )}
          {selectedRack && (
            <>
              <ChevronRight size={14} />
              <span className={!selectedLevel ? styles.breadcrumbActive : undefined}>
                Rack {selectedRack.code}
              </span>
            </>
          )}
          {selectedLevel && (
            <>
              <ChevronRight size={14} />
              <span className={!selectedPosition ? styles.breadcrumbActive : undefined}>
                Level {selectedLevel.code}
              </span>
            </>
          )}
          {selectedPosition && (
            <>
              <ChevronRight size={14} />
              <span className={styles.breadcrumbActive}>Pos {selectedPosition.code}</span>
            </>
          )}
        </div>
      </div>

      {/* 4-Tier Grid */}
      <div className={styles.explorerGrid}>
        {/* Tier 1: Chambers */}
        <div className={styles.column}>
          <div className={styles.columnHeader}>
            <div className={styles.columnTitle}>
              <Warehouse size={16} />
              <span>Chambers ({chambers.length})</span>
            </div>
            {canManage && (
              <button
                type="button"
                className={styles.columnAddBtn}
                onClick={() => {
                  setFormError(null);
                  setActiveModal('chamber');
                }}
                title="Add Chamber"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          <div className={styles.columnBody}>
            {loadingChambers ? (
              <FeedbackStates.Loading label="Loading chambers..." />
            ) : chambers.length === 0 ? (
              <div className={styles.emptyColumnNotice}>
                <span>No chambers in this facility.</span>
                {canManage && (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                    onClick={() => setActiveModal('chamber')}
                  >
                    + Create Chamber
                  </button>
                )}
              </div>
            ) : (
              chambers.map((chamber) => (
                <button
                  type="button"
                  key={chamber.id}
                  className={`${styles.itemCard} ${
                    selectedChamber?.id === chamber.id ? styles.itemCardActive : ''
                  }`}
                  onClick={() => handleSelectChamber(chamber)}
                >
                  <div className={styles.itemCardTop}>
                    <span className={styles.itemCode}>Chamber {chamber.chamberNumber}</span>
                    <span
                      className={`${styles.badge} ${
                        chamber.isActive ? styles.badgeActive : styles.badgeInactive
                      }`}
                    >
                      {chamber.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {chamber.name && <span className={styles.itemName}>{chamber.name}</span>}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Tier 2: Racks */}
        <div className={styles.column}>
          <div className={styles.columnHeader}>
            <div className={styles.columnTitle}>
              <Layers size={16} />
              <span>Racks {selectedChamber ? `(${racks.length})` : ''}</span>
            </div>
            {canManage && selectedChamber && (
              <button
                type="button"
                className={styles.columnAddBtn}
                onClick={() => {
                  setFormError(null);
                  setActiveModal('rack');
                }}
                title="Add Rack"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          <div className={styles.columnBody}>
            {!selectedChamber ? (
              <div className={styles.emptyColumnNotice}>
                <span>Select a chamber to view racks.</span>
              </div>
            ) : loadingRacks ? (
              <FeedbackStates.Loading label="Loading racks..." />
            ) : racks.length === 0 ? (
              <div className={styles.emptyColumnNotice}>
                <span>No racks created yet.</span>
                {canManage && (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                    onClick={() => setActiveModal('rack')}
                  >
                    + Create Rack
                  </button>
                )}
              </div>
            ) : (
              racks.map((rack) => (
                <button
                  type="button"
                  key={rack.id}
                  className={`${styles.itemCard} ${
                    selectedRack?.id === rack.id ? styles.itemCardActive : ''
                  }`}
                  onClick={() => handleSelectRack(rack)}
                >
                  <div className={styles.itemCardTop}>
                    <span className={styles.itemCode}>Rack {rack.code}</span>
                    <span
                      className={`${styles.badge} ${
                        rack.isActive ? styles.badgeActive : styles.badgeInactive
                      }`}
                    >
                      {rack.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Tier 3: Levels */}
        <div className={styles.column}>
          <div className={styles.columnHeader}>
            <div className={styles.columnTitle}>
              <Boxes size={16} />
              <span>Levels {selectedRack ? `(${levels.length})` : ''}</span>
            </div>
            {canManage && selectedRack && (
              <button
                type="button"
                className={styles.columnAddBtn}
                onClick={() => {
                  setFormError(null);
                  setActiveModal('level');
                }}
                title="Add Level"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          <div className={styles.columnBody}>
            {!selectedRack ? (
              <div className={styles.emptyColumnNotice}>
                <span>Select a rack to view levels.</span>
              </div>
            ) : loadingLevels ? (
              <FeedbackStates.Loading label="Loading levels..." />
            ) : levels.length === 0 ? (
              <div className={styles.emptyColumnNotice}>
                <span>No levels created yet.</span>
                {canManage && (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                    onClick={() => setActiveModal('level')}
                  >
                    + Create Level
                  </button>
                )}
              </div>
            ) : (
              levels.map((lvl) => (
                <button
                  type="button"
                  key={lvl.id}
                  className={`${styles.itemCard} ${
                    selectedLevel?.id === lvl.id ? styles.itemCardActive : ''
                  }`}
                  onClick={() => handleSelectLevel(lvl)}
                >
                  <div className={styles.itemCardTop}>
                    <span className={styles.itemCode}>Level {lvl.code}</span>
                    <span className={styles.itemName}>Tier #{lvl.levelNumber}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Tier 4: Positions */}
        <div className={styles.column}>
          <div className={styles.columnHeader}>
            <div className={styles.columnTitle}>
              <Package size={16} />
              <span>Positions {selectedLevel ? `(${positions.length})` : ''}</span>
            </div>
            {canManage && selectedLevel && (
              <button
                type="button"
                className={styles.columnAddBtn}
                onClick={() => {
                  setFormError(null);
                  setActiveModal('position');
                }}
                title="Add Position"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          <div className={styles.columnBody}>
            {!selectedLevel ? (
              <div className={styles.emptyColumnNotice}>
                <span>Select a level to view storage positions.</span>
              </div>
            ) : loadingPositions ? (
              <FeedbackStates.Loading label="Loading positions..." />
            ) : positions.length === 0 ? (
              <div className={styles.emptyColumnNotice}>
                <span>No positions configured yet.</span>
                {canManage && (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                    onClick={() => setActiveModal('position')}
                  >
                    + Create Position
                  </button>
                )}
              </div>
            ) : (
              positions.map((pos) => (
                <button
                  type="button"
                  key={pos.id}
                  className={`${styles.itemCard} ${
                    selectedPosition?.id === pos.id ? styles.itemCardActive : ''
                  }`}
                  onClick={() => handleSelectPosition(pos)}
                >
                  <div className={styles.itemCardTop}>
                    <span className={styles.itemCode}>Pos {pos.code}</span>
                    <span className={styles.itemName}>{pos.capacityBags} bags cap</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Selected Position Live Occupancy Inspector */}
      {selectedPosition && (
        <section className={styles.inspectorCard} aria-label="Position Occupancy Details">
          <div className={styles.inspectorHeader}>
            <h3>
              <Package size={18} color="var(--color-primary)" />
              Position Occupancy Breakdown: {selectedPosition.code}
            </h3>
            <span
              className={`${styles.badge} ${
                selectedPosition.isActive ? styles.badgeActive : styles.badgeInactive
              }`}
            >
              {selectedPosition.isActive ? 'Active Position' : 'Inactive Position'}
            </span>
          </div>

          {loadingOccupancy ? (
            <FeedbackStates.Loading label="Calculating position occupancy and stored lots..." />
          ) : positionOccupancy ? (
            <>
              {/* Capacity meter */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <span>
                    Utilization:{' '}
                    {(
                      (positionOccupancy.occupiedBags / (positionOccupancy.capacityBags || 1)) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                  <span>
                    {positionOccupancy.occupiedBags} / {positionOccupancy.capacityBags} Bags
                  </span>
                </div>
                <div className={styles.meterTrack}>
                  <div
                    className={`${styles.meterFill} ${
                      positionOccupancy.availableBags === 0
                        ? styles.meterFull
                        : positionOccupancy.occupiedBags / positionOccupancy.capacityBags > 0.8
                        ? styles.meterHigh
                        : ''
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (positionOccupancy.occupiedBags / (positionOccupancy.capacityBags || 1)) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Stats Row */}
              <div className={styles.statsRow}>
                <div className={styles.statBox}>
                  <div className={styles.statVal}>{positionOccupancy.capacityBags}</div>
                  <div className={styles.statLbl}>Rated Capacity (Bags)</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statVal} style={{ color: 'var(--color-primary)' }}>
                    {positionOccupancy.occupiedBags}
                  </div>
                  <div className={styles.statLbl}>Physically Occupied</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statVal} style={{ color: 'var(--color-success)' }}>
                    {positionOccupancy.availableBags}
                  </div>
                  <div className={styles.statLbl}>Available Free Space</div>
                </div>
              </div>

              {/* Stored Lots Table */}
              <div>
                <h4 style={{ fontSize: 'var(--text-sm)', margin: 'var(--space-2) 0' }}>
                  Physically Stored Lots ({positionOccupancy.storedLots.length})
                </h4>
                {positionOccupancy.storedLots.length === 0 ? (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    This position is currently completely vacant. Ready for incoming allocations.
                  </p>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>GRN #</th>
                          <th>Lot #</th>
                          <th>Commodity</th>
                          <th>Bags</th>
                          <th>Customer</th>
                          <th>Inward Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positionOccupancy.storedLots.map((lot, idx) => (
                          <tr key={`${lot.grnId}-${idx}`}>
                            <td style={{ fontWeight: 'var(--font-semibold)' }}>{lot.grnNumber}</td>
                            <td>{lot.lotNumber}</td>
                            <td>{lot.commodityName}</td>
                            <td style={{ fontWeight: 'var(--font-semibold)' }}>{lot.bags}</td>
                            <td>{lot.customerName}</td>
                            <td>{new Date(lot.inwardDate).toLocaleDateString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              Could not calculate occupancy for this position.
            </p>
          )}
        </section>
      )}

      {/* Creation Modal */}
      {activeModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>
                {activeModal === 'chamber' && 'Add New Chamber'}
                {activeModal === 'rack' && `Add Rack to Chamber ${selectedChamber?.chamberNumber}`}
                {activeModal === 'level' && `Add Level to Rack ${selectedRack?.code}`}
                {activeModal === 'position' && `Add Position to Level ${selectedLevel?.code}`}
              </h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setActiveModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className={styles.modalBody}>
                {formError && (
                  <div className={styles.bannerError} role="alert">
                    <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
                    {formError}
                  </div>
                )}

                {activeModal === 'chamber' && (
                  <>
                    <div className={styles.formGroup}>
                      <label htmlFor="chamber-num">Chamber Identifier / Number *</label>
                      <input
                        id="chamber-num"
                        className={styles.formInput}
                        placeholder="e.g. 1, 2, C-01"
                        value={chamberNumber}
                        onChange={(e) => setChamberNumber(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="chamber-name">Chamber Description / Name</label>
                      <input
                        id="chamber-name"
                        className={styles.formInput}
                        placeholder="e.g. Cold Storage Unit A (Apples)"
                        value={chamberName}
                        onChange={(e) => setChamberName(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {activeModal === 'rack' && (
                  <div className={styles.formGroup}>
                    <label htmlFor="rack-code">Rack Code *</label>
                    <input
                      id="rack-code"
                      className={styles.formInput}
                      placeholder="e.g. R01, R02, A"
                      value={rackCode}
                      onChange={(e) => setRackCode(e.target.value)}
                      required
                    />
                  </div>
                )}

                {activeModal === 'level' && (
                  <>
                    <div className={styles.formGroup}>
                      <label htmlFor="level-code">Level Code *</label>
                      <input
                        id="level-code"
                        className={styles.formInput}
                        placeholder="e.g. L1, L2, G"
                        value={levelCode}
                        onChange={(e) => setLevelCode(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="level-num">Tier Number (1-indexed) *</label>
                      <input
                        id="level-num"
                        type="number"
                        min={1}
                        className={styles.formInput}
                        value={levelNumber}
                        onChange={(e) => setLevelNumber(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                {activeModal === 'position' && (
                  <>
                    <div className={styles.formGroup}>
                      <label htmlFor="pos-code">Position Code *</label>
                      <input
                        id="pos-code"
                        className={styles.formInput}
                        placeholder="e.g. P01, P02, 1A"
                        value={positionCode}
                        onChange={(e) => setPositionCode(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="pos-cap">Rated Capacity (Bags) *</label>
                      <input
                        id="pos-cap"
                        type="number"
                        min={1}
                        className={styles.formInput}
                        value={capacityBags}
                        onChange={(e) => setCapacityBags(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setActiveModal(null)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submitting}
                >
                  {submitting ? 'Creating...' : 'Save & Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
