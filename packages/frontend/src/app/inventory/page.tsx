'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Archive,
  Boxes,
  Clock,
  Layers,
  Package,
  Plus,
  Search,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import {
  can,
  type Chamber,
  type FacilityInventorySummary,
  type Grn,
  type GrnInventorySummary,
  type InventoryTransaction,
  type Level,
  type Position,
  type PositionOccupancy,
  type PutAwayAllocation,
  type Rack,
  type Role,
} from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

interface AllocatingRow {
  id: string;
  rackId: string;
  levelId: string;
  positionId: string;
  bags: number | '';
}

function InventoryContent() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const searchParams = useSearchParams();
  const initialGrnId = searchParams.get('grnId');

  // Role permissions
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canAllocate = can(userRole, 'rack:allocate');
  const canManageStorage = can(userRole, 'storage:manage');

  // Active Tab
  const [activeTab, setActiveTab] = useState<'put-away' | 'hierarchy' | 'ledger'>(() =>
    initialGrnId ? 'put-away' : 'put-away',
  );

  // Facility Stock Summary
  const [stockSummary, setStockSummary] = useState<FacilityInventorySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Tab 1: Put-Away States
  const [openGrns, setOpenGrns] = useState<Grn[]>([]);
  const [selectedGrnId, setSelectedGrnId] = useState<string | null>(initialGrnId);
  const [grnSummary, setGrnSummary] = useState<GrnInventorySummary | null>(null);
  const [pastAllocations, setPastAllocations] = useState<PutAwayAllocation[]>([]);
  const [loadingGrnDetails, setLoadingGrnDetails] = useState(false);

  // Storage data for Put-Away dropdowns
  const [chamberRacks, setChamberRacks] = useState<Rack[]>([]);
  const [rackLevels, setRackLevels] = useState<Record<string, Level[]>>({});
  const [levelPositions, setLevelPositions] = useState<Record<string, Position[]>>({});

  // Dynamic allocation form rows
  const [allocRows, setAllocRows] = useState<AllocatingRow[]>([]);
  const [allocNotes, setAllocNotes] = useState('');
  const [allocSubmitting, setAllocSubmitting] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);

  // Tab 2: Storage Hierarchy States
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [activeChamberId, setActiveChamberId] = useState<string | null>(null);
  const [hierarchyRacks, setHierarchyRacks] = useState<Rack[]>([]);
  const [hierarchyLevels, setHierarchyLevels] = useState<Record<string, Level[]>>({});
  const [hierarchyPositions, setHierarchyPositions] = useState<Record<string, Position[]>>({});
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [selectedOccupancy, setSelectedOccupancy] = useState<PositionOccupancy | null>(null);

  // Storage Creation Modals
  const [isAddChamberOpen, setIsAddChamberOpen] = useState(false);
  const [newChamberNum, setNewChamberNum] = useState('');
  const [newChamberName, setNewChamberName] = useState('');
  const [isAddRackOpen, setIsAddRackOpen] = useState(false);
  const [newRackCode, setNewRackCode] = useState('');
  const [targetChamberForRack, setTargetChamberForRack] = useState<string>('');
  const [isAddPositionOpen, setIsAddPositionOpen] = useState(false);
  const [newPosCode, setNewPosCode] = useState('');
  const [newPosCapacity, setNewPosCapacity] = useState<number | ''>(500);
  const [targetLevelForPos, setTargetLevelForPos] = useState<string>('');
  const [hierarchyModalError, setHierarchyModalError] = useState<string | null>(null);

  // Tab 3: Stock Ledger States
  const [ledgerItems, setLedgerItems] = useState<InventoryTransaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('');

  // 1. Fetch Facility Stock Summary
  const fetchStockSummary = useCallback(async () => {
    if (!selectedFacilityId) return;
    setLoadingSummary(true);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/inventory`,
      );
      if (res.ok) {
        const data = (await res.json()) as { summary: FacilityInventorySummary };
        setStockSummary(data.summary);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedFacilityId]);

  // 2. Fetch Open GRNs for Put-Away
  const fetchOpenGrns = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?status=OPEN&limit=100`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: Grn[] };
        const items = data.items ?? [];
        setOpenGrns(items);
        if (!selectedGrnId && items.length > 0) {
          setSelectedGrnId(items[0].id);
        }
      }
    } catch {
      // Graceful fallback
    }
  }, [selectedFacilityId, selectedGrnId]);

  // 3. Fetch Selected GRN Inventory Summary & Put-Away History
  const fetchGrnSummaryAndHistory = useCallback(
    async (grnId: string) => {
      if (!selectedFacilityId || !grnId) return;
      setLoadingGrnDetails(true);
      setAllocError(null);
      try {
        const [sumRes, allocRes] = await Promise.all([
          requestWithAuth(
            `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(grnId)}/inventory-summary`,
          ),
          requestWithAuth(
            `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(grnId)}/allocations`,
          ),
        ]);

        if (sumRes.ok) {
          const data = (await sumRes.json()) as { summary: GrnInventorySummary };
          setGrnSummary(data.summary);

          // Fetch racks for this GRN's chamber
          const racksRes = await requestWithAuth(
            `/api/chambers/${encodeURIComponent(data.summary.chamberId)}/racks`,
          );
          if (racksRes.ok) {
            const racksData = (await racksRes.json()) as { items?: Rack[] };
            setChamberRacks((racksData.items ?? []).filter((r) => r.isActive));
          }
        }

        if (allocRes.ok) {
          const allocData = (await allocRes.json()) as { allocations?: PutAwayAllocation[] };
          setPastAllocations(allocData.allocations ?? []);
        }
      } catch (err: unknown) {
        setAllocError(err instanceof Error ? err.message : 'Failed to load GRN inventory details');
      } finally {
        setLoadingGrnDetails(false);
      }
    },
    [selectedFacilityId],
  );

  // 4. Fetch Hierarchy Chambers
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

  // 5. Fetch Racks, Levels, Positions for Active Chamber
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

      // Fetch levels for all active racks
      const levelMap: Record<string, Level[]> = {};
      const posMap: Record<string, Position[]> = {};

      await Promise.all(
        racks.map(async (rack) => {
          const lRes = await requestWithAuth(`/api/racks/${encodeURIComponent(rack.id)}/levels`);
          if (lRes.ok) {
            const lData = (await lRes.json()) as { items?: Level[] };
            const levels = (lData.items ?? []).filter((l) => l.isActive);
            levelMap[rack.id] = levels;

            // Fetch positions for each level
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

  // 6. Fetch Stock Ledger
  const fetchLedger = useCallback(async () => {
    if (!selectedFacilityId) return;
    setLedgerLoading(true);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/inventory/ledger?limit=100`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: InventoryTransaction[] };
        setLedgerItems(data.items ?? []);
      }
    } catch {
      // Graceful
    } finally {
      setLedgerLoading(false);
    }
  }, [selectedFacilityId]);

  // Sync when facility changes
  useEffect(() => {
    void fetchStockSummary();
    void fetchOpenGrns();
    void fetchChambers();
    void fetchLedger();
  }, [fetchStockSummary, fetchOpenGrns, fetchChambers, fetchLedger]);

  // Sync GRN summary when selected GRN changes
  useEffect(() => {
    if (selectedGrnId) {
      void fetchGrnSummaryAndHistory(selectedGrnId);
      // Reset alloc rows
      setAllocRows([
        {
          id: 'row-1',
          rackId: '',
          levelId: '',
          positionId: '',
          bags: '',
        },
      ]);
    }
  }, [selectedGrnId, fetchGrnSummaryAndHistory]);

  // Sync hierarchy when active chamber changes
  useEffect(() => {
    if (activeChamberId) {
      void fetchChamberHierarchy(activeChamberId);
    }
  }, [activeChamberId, fetchChamberHierarchy]);

  // Helper to load levels for an allocation row rack
  const handleAllocRackChange = async (rowId: string, rackId: string) => {
    setAllocRows((rows) =>
      rows.map((r) => (r.id === rowId ? { ...r, rackId, levelId: '', positionId: '' } : r)),
    );

    if (rackId && !rackLevels[rackId]) {
      try {
        const res = await requestWithAuth(`/api/racks/${encodeURIComponent(rackId)}/levels`);
        if (res.ok) {
          const data = (await res.json()) as { items?: Level[] };
          setRackLevels((prev) => ({
            ...prev,
            [rackId]: (data.items ?? []).filter((l) => l.isActive),
          }));
        }
      } catch {
        // Graceful
      }
    }
  };

  // Helper to load positions for an allocation row level
  const handleAllocLevelChange = async (rowId: string, levelId: string) => {
    setAllocRows((rows) =>
      rows.map((r) => (r.id === rowId ? { ...r, levelId, positionId: '' } : r)),
    );

    if (levelId && !levelPositions[levelId]) {
      try {
        const res = await requestWithAuth(
          `/api/levels/${encodeURIComponent(levelId)}/positions`,
        );
        if (res.ok) {
          const data = (await res.json()) as { items?: Position[] };
          setLevelPositions((prev) => ({
            ...prev,
            [levelId]: (data.items ?? []).filter((p) => p.isActive),
          }));
        }
      } catch {
        // Graceful
      }
    }
  };

  const handleAddAllocRow = () => {
    setAllocRows((rows) => [
      ...rows,
      {
        id: `row-${Date.now()}`,
        rackId: '',
        levelId: '',
        positionId: '',
        bags: '',
      },
    ]);
  };

  const handleRemoveAllocRow = (id: string) => {
    setAllocRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  };

  // Total bags currently allocated in the form
  const totalAllocatingBags = useMemo(() => {
    return allocRows.reduce((acc, r) => acc + (typeof r.bags === 'number' ? r.bags : 0), 0);
  }, [allocRows]);

  // Submit Put-Away Allocation
  const handlePutAwaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId || !selectedGrnId || !grnSummary) return;

    // Validation
    const validItems: Array<{ positionId: string; bags: number }> = [];
    const usedPositions = new Set<string>();

    for (const row of allocRows) {
      if (!row.positionId) {
        setAllocError('Please select a storage position for all rows');
        return;
      }
      if (usedPositions.has(row.positionId)) {
        setAllocError('Duplicate storage positions selected in allocation rows');
        return;
      }
      usedPositions.add(row.positionId);

      if (typeof row.bags !== 'number' || row.bags <= 0) {
        setAllocError('Each position must be allocated at least 1 bag');
        return;
      }
      validItems.push({ positionId: row.positionId, bags: row.bags });
    }

    if (totalAllocatingBags > grnSummary.unallocatedBags) {
      setAllocError(
        `Total allocated bags (${totalAllocatingBags}) exceeds GRN unallocated bags (${grnSummary.unallocatedBags})`,
      );
      return;
    }

    setAllocSubmitting(true);
    setAllocError(null);

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(selectedGrnId)}/allocations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: validItems,
            notes: allocNotes.trim() || undefined,
          }),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Allocation failed with HTTP ${res.status}`);
      }

      // Success: reload GRN summary, stock summary, and ledger
      setAllocNotes('');
      void fetchGrnSummaryAndHistory(selectedGrnId);
      void fetchStockSummary();
      void fetchLedger();
    } catch (err: unknown) {
      setAllocError(err instanceof Error ? err.message : 'Put-away allocation failed');
    } finally {
      setAllocSubmitting(false);
    }
  };

  // Inspect Position Occupancy
  const handleInspectPosition = async (posId: string) => {
    if (!selectedFacilityId) return;
    setSelectedOccupancy(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/positions/${encodeURIComponent(posId)}/occupancy`,
      );
      if (res.ok) {
        const data = (await res.json()) as { occupancy: PositionOccupancy };
        setSelectedOccupancy(data.occupancy);
      }
    } catch {
      // Graceful
    }
  };

  // Create Chamber Submit
  const handleCreateChamber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId || !newChamberNum.trim()) return;
    setHierarchyModalError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/chambers`,
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
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Failed to create chamber');
      }
      setIsAddChamberOpen(false);
      setNewChamberNum('');
      setNewChamberName('');
      void fetchChambers();
    } catch (err: unknown) {
      setHierarchyModalError(err instanceof Error ? err.message : 'Error creating chamber');
    }
  };

  // Create Rack Submit
  const handleCreateRack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetChamberForRack || !newRackCode.trim()) return;
    setHierarchyModalError(null);
    try {
      const res = await requestWithAuth(
        `/api/chambers/${encodeURIComponent(targetChamberForRack)}/racks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: newRackCode.trim() }),
        },
      );
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Failed to create rack');
      }
      setIsAddRackOpen(false);
      setNewRackCode('');
      void fetchChamberHierarchy(targetChamberForRack);
    } catch (err: unknown) {
      setHierarchyModalError(err instanceof Error ? err.message : 'Error creating rack');
    }
  };

  // Create Position Submit
  const handleCreatePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLevelForPos || !newPosCode.trim() || typeof newPosCapacity !== 'number') return;
    setHierarchyModalError(null);
    try {
      const res = await requestWithAuth(
        `/api/levels/${encodeURIComponent(targetLevelForPos)}/positions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: newPosCode.trim(),
            capacityBags: newPosCapacity,
          }),
        },
      );
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Failed to create position');
      }
      setIsAddPositionOpen(false);
      setNewPosCode('');
      setNewPosCapacity(500);
      if (activeChamberId) {
        void fetchChamberHierarchy(activeChamberId);
      }
    } catch (err: unknown) {
      setHierarchyModalError(err instanceof Error ? err.message : 'Error creating position');
    }
  };

  // Filtered Stock Ledger items
  const filteredLedger = useMemo(() => {
    return ledgerItems.filter((tx) => {
      const matchSearch =
        !ledgerSearch.trim() ||
        tx.grnNumber.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        tx.positionCode.toLowerCase().includes(ledgerSearch.toLowerCase());
      const matchType = !ledgerTypeFilter || tx.transactionType === ledgerTypeFilter;
      return matchSearch && matchType;
    });
  }, [ledgerItems, ledgerSearch, ledgerTypeFilter]);

  // Ledger Columns
  const ledgerColumns: DataTableColumn<InventoryTransaction>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (r) => (
        <span>
          {new Date(r.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
      ),
    },
    {
      key: 'transactionType',
      header: 'Event Type',
      render: (r) => (
        <span
          className={
            r.transactionType === 'INWARD_PUTAWAY'
              ? styles.typePutAway
              : r.transactionType === 'OUTWARD_DELIVERY'
                ? styles.typeDelivery
                : styles.typeReversal
          }
        >
          {r.transactionType}
        </span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      render: (r) => <span style={{ fontWeight: 600 }}>{r.grnNumber}</span>,
    },
    {
      key: 'positionCode',
      header: 'Storage Location',
      render: (r) => (
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{r.positionCode}</span>
      ),
    },
    {
      key: 'quantity',
      header: 'Bags',
      align: 'right',
      render: (r) => (
        <span style={{ fontWeight: 600 }}>
          {r.transactionType === 'OUTWARD_DELIVERY' ? `-${r.quantity}` : `+${r.quantity}`}
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: 'Operator',
      render: (r) => (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {r.createdBy}
        </span>
      ),
    },
  ];

  const currentFacilityName = useMemo(() => {
    return availableFacilities.find((f) => f.id === selectedFacilityId)?.name ?? selectedFacilityId;
  }, [availableFacilities, selectedFacilityId]);

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Inventory & Put-Away</h1>
          <p className={styles.pageSub}>
            Storage capacity, position-level rack allocation, and immutable stock audit trail for {currentFacilityName}.
          </p>
        </div>
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message="Please select a facility from the top header to manage inventory." />
      ) : (
        <>
          {/* Live Capacity KPI Cards */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrap}>
                <Package size={24} aria-hidden="true" />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Total Stock in Storage</span>
                <span className={styles.kpiValue}>
                  {loadingSummary ? '...' : (stockSummary?.totalStockBags ?? 0).toLocaleString('en-IN')}{' '}
                  bags
                </span>
                <span className={styles.kpiSub}>Active inventory across facility</span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrap}>
                <Boxes size={24} aria-hidden="true" />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Commodities Stored</span>
                <span className={styles.kpiValue}>
                  {loadingSummary ? '...' : stockSummary?.byCommodity.length ?? 0}
                </span>
                <span className={styles.kpiSub}>
                  {stockSummary?.byCommodity.map((c) => c.commodityName).join(', ') ||
                    'Zero stock recorded'}
                </span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrap}>
                <Warehouse size={24} aria-hidden="true" />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Active Chambers</span>
                <span className={styles.kpiValue}>{chambers.length}</span>
                <span className={styles.kpiSub}>
                  {chambers.map((c) => `Chamber ${c.chamberNumber}`).join(', ') || 'No chambers'}
                </span>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className={styles.tabsBar}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'put-away' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('put-away')}
            >
              <Archive size={16} aria-hidden="true" />
              Put-Away Allocations
              {openGrns.length > 0 && <span className={styles.tabBadge}>{openGrns.length}</span>}
            </button>

            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'hierarchy' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('hierarchy')}
            >
              <Layers size={16} aria-hidden="true" />
              Storage Hierarchy & Capacity Grid
            </button>

            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'ledger' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('ledger')}
            >
              <Clock size={16} aria-hidden="true" />
              Immutable Stock Ledger
            </button>
          </div>

          {/* TAB 1: PUT-AWAY ALLOCATIONS */}
          {activeTab === 'put-away' && (
            <div className={styles.putAwayLayout}>
              {/* Left Sidebar: OPEN GRNs */}
              <div className={styles.grnSidebar}>
                <div className={styles.sidebarHeader}>
                  <span>Pending Inward GRNs ({openGrns.length})</span>
                </div>

                {openGrns.length === 0 ? (
                  <FeedbackStates.Empty message="No OPEN Goods Receipt Notes requiring allocation." />
                ) : (
                  <div className={styles.grnList}>
                    {openGrns.map((g) => {
                      const isActive = g.id === selectedGrnId;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          className={`${styles.grnCard} ${isActive ? styles.grnCardActive : ''}`}
                          onClick={() => setSelectedGrnId(g.id)}
                        >
                          <div className={styles.grnCardTop}>
                            <span className={styles.grnCardNum}>{g.grnNumber}</span>
                            <span className={styles.unallocatedPill}>
                              Chamber {g.chamberNumber}
                            </span>
                          </div>
                          <span className={styles.grnCardCust}>{g.customerName}</span>
                          <div className={styles.grnCardMeta}>
                            <span>{g.commodityName}</span>
                            <span style={{ fontWeight: 600 }}>{g.bags} bags</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Work Area: Allocation Details & Form */}
              <div className={styles.putAwayWorkArea}>
                {!selectedGrnId || !grnSummary ? (
                  <FeedbackStates.Empty message="Select an inward GRN from the left list to allocate bags." />
                ) : loadingGrnDetails ? (
                  <FeedbackStates.Loading label="Loading GRN allocation summary..." />
                ) : (
                  <>
                    {/* Allocation Status Card */}
                    <div className={styles.summaryCard}>
                      <div className={styles.summaryHeader}>
                        <div>
                          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                            {grnSummary.grnNumber}
                          </h2>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            Assigned Chamber: Chamber {grnSummary.chamberNumber}
                          </span>
                        </div>
                        <span
                          className={
                            grnSummary.putAwayStatus === 'FULLY_ALLOCATED'
                              ? styles.fullyAllocatedPill
                              : styles.unallocatedPill
                          }
                        >
                          {grnSummary.putAwayStatus}
                        </span>
                      </div>

                      <div className={styles.progressBarContainer}>
                        <div className={styles.progressBarTrack}>
                          <div
                            className={styles.progressBarFill}
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (grnSummary.allocatedBags / grnSummary.totalBags) * 100,
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <div className={styles.progressBarText}>
                          <span>
                            Allocated: <strong>{grnSummary.allocatedBags}</strong> /{' '}
                            {grnSummary.totalBags} bags
                          </span>
                          <span>
                            Unallocated Remaining:{' '}
                            <strong style={{ color: 'var(--color-warning)' }}>
                              {grnSummary.unallocatedBags}
                            </strong>{' '}
                            bags
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Put-Away Allocation Form */}
                    {grnSummary.unallocatedBags > 0 && canAllocate && (
                      <div className={styles.allocationFormCard}>
                        <div className={styles.formHeader}>
                          <h3 className={styles.formSectionTitle}>Allocate Bags to Rack Positions</h3>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            Target Chamber: Chamber {grnSummary.chamberNumber}
                          </span>
                        </div>

                        {allocError && <div className={styles.modalError}>{allocError}</div>}

                        <form onSubmit={handlePutAwaySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {allocRows.map((row) => (
                              <div key={row.id} className={styles.allocRow}>
                                {/* Rack Select */}
                                <select
                                  aria-label="Select Rack"
                                  className={styles.fieldSelect}
                                  required
                                  value={row.rackId}
                                  onChange={(e) => void handleAllocRackChange(row.id, e.target.value)}
                                >
                                  <option value="">Select Rack</option>
                                  {chamberRacks.map((rk) => (
                                    <option key={rk.id} value={rk.id}>
                                      Rack {rk.code}
                                    </option>
                                  ))}
                                </select>

                                {/* Level Select */}
                                <select
                                  aria-label="Select Level"
                                  className={styles.fieldSelect}
                                  required
                                  disabled={!row.rackId}
                                  value={row.levelId}
                                  onChange={(e) => void handleAllocLevelChange(row.id, e.target.value)}
                                >
                                  <option value="">Select Level</option>
                                  {(rackLevels[row.rackId] ?? []).map((lvl) => (
                                    <option key={lvl.id} value={lvl.id}>
                                      Level {lvl.levelNumber} ({lvl.code})
                                    </option>
                                  ))}
                                </select>

                                {/* Position Select */}
                                <select
                                  aria-label="Select Position"
                                  className={styles.fieldSelect}
                                  required
                                  disabled={!row.levelId}
                                  value={row.positionId}
                                  onChange={(e) =>
                                    setAllocRows((rows) =>
                                      rows.map((r) =>
                                        r.id === row.id ? { ...r, positionId: e.target.value } : r,
                                      ),
                                    )
                                  }
                                >
                                  <option value="">Select Position</option>
                                  {(levelPositions[row.levelId] ?? []).map((pos) => (
                                    <option key={pos.id} value={pos.id}>
                                      {pos.code} (Cap: {pos.capacityBags} bags)
                                    </option>
                                  ))}
                                </select>

                                {/* Bags Input */}
                                <input
                                  type="number"
                                  aria-label="Bags"
                                  className={styles.fieldInput}
                                  required
                                  min={1}
                                  max={grnSummary.unallocatedBags}
                                  placeholder="Bags"
                                  value={row.bags}
                                  onChange={(e) =>
                                    setAllocRows((rows) =>
                                      rows.map((r) =>
                                        r.id === row.id
                                          ? {
                                              ...r,
                                              bags: e.target.value
                                                ? parseInt(e.target.value, 10)
                                                : '',
                                            }
                                          : r,
                                      ),
                                    )
                                  }
                                />

                                {/* Remove Button */}
                                {allocRows.length > 1 && (
                                  <button
                                    type="button"
                                    className={styles.removeBtn}
                                    onClick={() => handleRemoveAllocRow(row.id)}
                                    title="Remove position row"
                                  >
                                    <Trash2 size={16} aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            className={styles.addAllocBtn}
                            onClick={handleAddAllocRow}
                          >
                            <Plus size={14} aria-hidden="true" />
                            Add Another Position
                          </button>

                          <input
                            type="text"
                            placeholder="Optional put-away notes or lot observations"
                            className={styles.fieldInput}
                            value={allocNotes}
                            onChange={(e) => setAllocNotes(e.target.value)}
                            maxLength={500}
                          />

                          <div className={styles.formFooter}>
                            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                              Total Allocating:{' '}
                              <span style={{ color: 'var(--color-primary)' }}>
                                {totalAllocatingBags}
                              </span>{' '}
                              / {grnSummary.unallocatedBags} bags
                            </span>

                            <button
                              id="submit-allocation-btn"
                              type="submit"
                              className={styles.primaryBtn}
                              disabled={allocSubmitting || totalAllocatingBags <= 0}
                            >
                              {allocSubmitting ? 'Recording Batch...' : 'Confirm Put-Away Allocation'}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Past Allocation Batches */}
                    <div className={styles.summaryCard}>
                      <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
                        Allocation History ({pastAllocations.length} batches)
                      </h3>

                      {pastAllocations.length === 0 ? (
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          No allocations recorded yet for this GRN.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                          {pastAllocations.map((batch) => (
                            <div
                              key={batch.id}
                              style={{
                                padding: 'var(--space-3)',
                                background: 'var(--color-surface-2)',
                                borderRadius: 'var(--radius-md)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: 'var(--text-xs)',
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 600 }}>
                                  {batch.totalBags} Bags Allocated
                                </span>
                                <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                                  by {batch.allocatedBy} on{' '}
                                  {new Date(batch.allocatedAt).toLocaleDateString('en-IN')}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {batch.items.map((it) => (
                                  <span
                                    key={it.positionId}
                                    style={{
                                      padding: '2px 6px',
                                      background: 'var(--color-surface-1)',
                                      borderRadius: 'var(--radius-sm)',
                                      border: '1px solid var(--color-border)',
                                      fontFamily: 'monospace',
                                    }}
                                  >
                                    {it.positionCode}: {it.bags}b
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: STORAGE HIERARCHY & CAPACITY GRID */}
          {activeTab === 'hierarchy' && (
            <div className={styles.hierarchyLayout}>
              {/* Chamber Nav */}
              <div className={styles.headerRow}>
                <div className={styles.chamberNav}>
                  {chambers.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      className={`${styles.chamberTab} ${activeChamberId === ch.id ? styles.chamberTabActive : ''}`}
                      onClick={() => setActiveChamberId(ch.id)}
                    >
                      Chamber {ch.chamberNumber}
                    </button>
                  ))}
                </div>

                {canManageStorage && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => {
                      setHierarchyModalError(null);
                      setIsAddChamberOpen(true);
                    }}
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add Chamber
                  </button>
                )}
              </div>

              {loadingHierarchy ? (
                <FeedbackStates.Loading label="Loading storage hierarchy..." />
              ) : chambers.length === 0 ? (
                <FeedbackStates.Empty
                  message="No storage chambers configured for this facility."
                  action={
                    canManageStorage
                      ? {
                          label: '+ Add Chamber',
                          onClick: () => setIsAddChamberOpen(true),
                        }
                      : undefined
                  }
                />
              ) : (
                <div className={styles.racksContainer}>
                  {/* Actions for current Chamber */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                    {canManageStorage && activeChamberId && (
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={() => {
                          setTargetChamberForRack(activeChamberId);
                          setHierarchyModalError(null);
                          setIsAddRackOpen(true);
                        }}
                      >
                        <Plus size={14} aria-hidden="true" />
                        Add Rack to Chamber
                      </button>
                    )}
                  </div>

                  {hierarchyRacks.length === 0 ? (
                    <FeedbackStates.Empty message="No active racks found in this chamber." />
                  ) : (
                    hierarchyRacks.map((rack) => {
                      const levels = hierarchyLevels[rack.id] ?? [];
                      return (
                        <div key={rack.id} className={styles.rackCard}>
                          <div className={styles.rackHeader}>
                            <span className={styles.rackTitle}>Rack {rack.code}</span>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                              {levels.length} Levels
                            </span>
                          </div>

                          <div className={styles.levelsContainer}>
                            {levels.map((lvl) => {
                              const positions = hierarchyPositions[lvl.id] ?? [];
                              return (
                                <div key={lvl.id} className={styles.levelRow}>
                                  <div className={styles.levelHeader}>
                                    <span className={styles.levelTitle}>
                                      Level {lvl.levelNumber} ({lvl.code})
                                    </span>
                                    {canManageStorage && (
                                      <button
                                        type="button"
                                        style={{
                                          fontSize: 'var(--text-xs)',
                                          background: 'transparent',
                                          border: 'none',
                                          color: 'var(--color-primary)',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}
                                        onClick={() => {
                                          setTargetLevelForPos(lvl.id);
                                          setHierarchyModalError(null);
                                          setIsAddPositionOpen(true);
                                        }}
                                      >
                                        <Plus size={12} aria-hidden="true" />
                                        Add Position
                                      </button>
                                    )}
                                  </div>

                                  <div className={styles.positionsGrid}>
                                    {positions.map((pos) => (
                                      <button
                                        key={pos.id}
                                        type="button"
                                        className={styles.positionSlot}
                                        onClick={() => void handleInspectPosition(pos.id)}
                                        title="Click to view live occupancy & stored lots"
                                      >
                                        <span className={styles.posCode}>{pos.code}</span>
                                        <span className={styles.posCapacity}>
                                          Cap: {pos.capacityBags}b
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: IMMUTABLE STOCK LEDGER */}
          {activeTab === 'ledger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className={styles.toolbar}>
                <div className={styles.searchGroup}>
                  <Search size={16} color="var(--color-text-muted)" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search GRN # or Position Code..."
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                <select
                  aria-label="Filter Transaction Type"
                  className={styles.filterSelect}
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value)}
                >
                  <option value="">All Event Types</option>
                  <option value="INWARD_PUTAWAY">Inward Put-Away</option>
                  <option value="OUTWARD_DELIVERY">Outward Delivery</option>
                  <option value="DELIVERY_REVERSAL">Delivery Reversal</option>
                </select>
              </div>

              {ledgerLoading ? (
                <FeedbackStates.Loading label="Loading stock ledger events..." />
              ) : filteredLedger.length === 0 ? (
                <FeedbackStates.Empty message="No stock ledger events recorded yet." />
              ) : (
                <DataTable
                  columns={ledgerColumns}
                  rows={filteredLedger}
                  rowKey={(r) => r.id}
                  caption="Immutable Inventory Stock Ledger"
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Position Occupancy Modal */}
      {selectedOccupancy && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="occ-modal-title"
        >
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 id="occ-modal-title" className={styles.modalTitle}>
                Position Occupancy: {selectedOccupancy.code}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSelectedOccupancy(null)}
                aria-label="Close dialog"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: 'var(--color-surface-2)',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Capacity
                  </span>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>
                    {selectedOccupancy.capacityBags} bags
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Occupied
                  </span>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>
                    {selectedOccupancy.occupiedBags} bags
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Available
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-base)',
                      fontWeight: 700,
                      color: 'var(--color-success)',
                    }}
                  >
                    {selectedOccupancy.availableBags} bags
                  </span>
                </div>
              </div>

              <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase' }}>
                Stored Lots ({selectedOccupancy.storedLots.length})
              </h4>

              {selectedOccupancy.storedLots.length === 0 ? (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  This position is currently empty.
                </p>
              ) : (
                <div className={styles.lotsList}>
                  {selectedOccupancy.storedLots.map((lot) => (
                    <div key={lot.grnId} className={styles.lotItem}>
                      <span style={{ fontWeight: 600 }}>{lot.grnNumber}</span>
                      <span>Type: {lot.bagType}</span>
                      <span style={{ fontWeight: 600 }}>{lot.bags} bags</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setSelectedOccupancy(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Chamber Modal */}
      {isAddChamberOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add New Storage Chamber</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setIsAddChamberOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleCreateChamber}>
              <div className={styles.modalBody}>
                {hierarchyModalError && (
                  <div className={styles.modalError}>{hierarchyModalError}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <label htmlFor="new-ch-num" style={{ fontSize: 'var(--text-sm)' }}>
                    Chamber Number *
                  </label>
                  <input
                    id="new-ch-num"
                    required
                    className={styles.fieldInput}
                    placeholder="e.g. 1"
                    value={newChamberNum}
                    onChange={(e) => setNewChamberNum(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <label htmlFor="new-ch-name" style={{ fontSize: 'var(--text-sm)' }}>
                    Display Name
                  </label>
                  <input
                    id="new-ch-name"
                    className={styles.fieldInput}
                    placeholder="e.g. Cold Chamber A"
                    value={newChamberName}
                    onChange={(e) => setNewChamberName(e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsAddChamberOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Create Chamber
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Rack Modal */}
      {isAddRackOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add New Rack</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setIsAddRackOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleCreateRack}>
              <div className={styles.modalBody}>
                {hierarchyModalError && (
                  <div className={styles.modalError}>{hierarchyModalError}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <label htmlFor="new-rk-code" style={{ fontSize: 'var(--text-sm)' }}>
                    Rack Code *
                  </label>
                  <input
                    id="new-rk-code"
                    required
                    className={styles.fieldInput}
                    placeholder="e.g. R1"
                    value={newRackCode}
                    onChange={(e) => setNewRackCode(e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsAddRackOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Create Rack
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Position Modal */}
      {isAddPositionOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add Storage Position</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setIsAddPositionOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleCreatePosition}>
              <div className={styles.modalBody}>
                {hierarchyModalError && (
                  <div className={styles.modalError}>{hierarchyModalError}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <label htmlFor="new-pos-code" style={{ fontSize: 'var(--text-sm)' }}>
                    Position Code *
                  </label>
                  <input
                    id="new-pos-code"
                    required
                    className={styles.fieldInput}
                    placeholder="e.g. P1"
                    value={newPosCode}
                    onChange={(e) => setNewPosCode(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <label htmlFor="new-pos-cap" style={{ fontSize: 'var(--text-sm)' }}>
                    Capacity (Bags) *
                  </label>
                  <input
                    id="new-pos-cap"
                    type="number"
                    min={1}
                    required
                    className={styles.fieldInput}
                    placeholder="e.g. 500"
                    value={newPosCapacity}
                    onChange={(e) =>
                      setNewPosCapacity(e.target.value ? parseInt(e.target.value, 10) : '')
                    }
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsAddPositionOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Create Position
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<FeedbackStates.Loading label="Loading inventory..." />}>
      <InventoryContent />
    </Suspense>
  );
}
