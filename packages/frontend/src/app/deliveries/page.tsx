'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import {
  can,
  type DeliveryChallan,
  type DeliveryStatus,
  type Grn,
  type GrnInventorySummary,
  type Role,
} from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

interface PositionWithdrawal {
  positionId: string;
  positionCode: string;
  maxBags: number;
  bags: number | '';
}

export default function DeliveriesPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();

  // Data states
  const [deliveries, setDeliveries] = useState<DeliveryChallan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | DeliveryStatus>('');

  // Selected delivery for detail modal
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryChallan | null>(null);

  // Printing state
  const [printingId, setPrintingId] = useState<string | null>(null);

  // Reversal states
  const [reversingDelivery, setReversingDelivery] = useState<DeliveryChallan | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalSubmitting, setReversalSubmitting] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  // Create Delivery Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [availableGrns, setAvailableGrns] = useState<Grn[]>([]);
  const [createGrnId, setCreateGrnId] = useState('');
  const [grnSummary, setGrnSummary] = useState<GrnInventorySummary | null>(null);
  const [loadingGrnSummary, setLoadingGrnSummary] = useState(false);
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [withdrawals, setWithdrawals] = useState<PositionWithdrawal[]>([]);
  const [createVehicleNumber, setCreateVehicleNumber] = useState('');
  const [createDriverName, setCreateDriverName] = useState('');
  const [createWeight, setCreateWeight] = useState<number | ''>('');
  const [createRemarks, setCreateRemarks] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // RBAC checks
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canCreate = can(userRole, 'delivery:create');
  const canPrint = can(userRole, 'document:print');
  const canReverse = can(userRole, 'delivery:reversal');

  // Fetch Deliveries
  const fetchDeliveries = useCallback(async () => {
    if (!selectedFacilityId) {
      setDeliveries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (statusFilter) params.set('status', statusFilter);

      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/deliveries?${params.toString()}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: DeliveryChallan[] };
      setDeliveries(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId, statusFilter]);

  // Fetch Available GRNs for Delivery Creation
  const fetchAvailableGrns = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?status=OPEN&limit=100`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: Grn[] };
        setAvailableGrns(data.items ?? []);
      }
    } catch {
      // Graceful
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchDeliveries();
  }, [fetchDeliveries]);

  // When a GRN is chosen in Create Modal, load its inventory summary to see occupied positions
  const handleSelectGrn = async (grnId: string) => {
    setCreateGrnId(grnId);
    setGrnSummary(null);
    setWithdrawals([]);
    if (!selectedFacilityId || !grnId) return;

    setLoadingGrnSummary(true);
    setModalError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(grnId)}/inventory-summary`,
      );
      if (res.ok) {
        const data = (await res.json()) as { summary: GrnInventorySummary };
        setGrnSummary(data.summary);
        // Prepopulate withdrawal rows for positions that have bags
        const rows: PositionWithdrawal[] = data.summary.positions.map((p) => ({
          positionId: p.positionId,
          positionCode: p.positionCode,
          maxBags: p.bags,
          bags: '',
        }));
        setWithdrawals(rows);
      }
    } catch {
      setModalError('Failed to load GRN position allocation summary');
    } finally {
      setLoadingGrnSummary(false);
    }
  };

  // Open Create Modal
  const openCreateModal = () => {
    void fetchAvailableGrns();
    setCreateGrnId('');
    setGrnSummary(null);
    setWithdrawals([]);
    setCreateDate(new Date().toISOString().split('T')[0]);
    setCreateVehicleNumber('');
    setCreateDriverName('');
    setCreateWeight('');
    setCreateRemarks('');
    setModalError(null);
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setModalError(null);
  };

  // Total bags selected for delivery
  const totalWithdrawingBags = useMemo(() => {
    return withdrawals.reduce(
      (acc, w) => acc + (typeof w.bags === 'number' ? w.bags : 0),
      0,
    );
  }, [withdrawals]);

  // Create Delivery Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId) return;

    if (!createGrnId) {
      setModalError('Please select a GRN to withdraw stock from');
      return;
    }

    const activeWithdrawals = withdrawals.filter(
      (w) => typeof w.bags === 'number' && w.bags > 0,
    );

    if (activeWithdrawals.length === 0) {
      setModalError('Please specify at least 1 bag to withdraw from an allocated position');
      return;
    }

    for (const w of activeWithdrawals) {
      if ((w.bags as number) > w.maxBags) {
        setModalError(
          `Cannot withdraw ${w.bags} bags from position ${w.positionCode} (only ${w.maxBags} available)`,
        );
        return;
      }
    }

    if (createVehicleNumber.trim()) {
      const vehicleRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{1,4}$/;
      if (!vehicleRegex.test(createVehicleNumber.trim().toUpperCase())) {
        setModalError('Vehicle registration must be in standard Indian format (e.g. UP32AA1111)');
        return;
      }
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const payload: Record<string, unknown> = {
        grnId: createGrnId,
        date: new Date(createDate),
        items: activeWithdrawals.map((w) => ({
          positionId: w.positionId,
          bags: w.bags as number,
        })),
      };

      if (createVehicleNumber.trim()) {
        payload.vehicleNumber = createVehicleNumber.trim().toUpperCase();
      }
      if (createDriverName.trim()) {
        payload.driverName = createDriverName.trim();
      }
      if (typeof createWeight === 'number' && createWeight > 0) {
        payload.weight = createWeight;
      }
      if (createRemarks.trim()) {
        payload.remarks = createRemarks.trim();
      }

      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/deliveries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Delivery failed with HTTP ${res.status}`);
      }

      const responseData = (await res.json()) as { delivery: DeliveryChallan };
      closeCreateModal();
      void fetchDeliveries();

      if (responseData.delivery) {
        setSelectedDelivery(responseData.delivery);
      }
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to issue delivery challan');
    } finally {
      setSubmitting(false);
    }
  };

  // Reversal Submit
  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId || !reversingDelivery) return;

    if (!reversalReason.trim() || reversalReason.trim().length < 5) {
      setReversalError('Reversal reason must be at least 5 characters');
      return;
    }

    setReversalSubmitting(true);
    setReversalError(null);

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/deliveries/${encodeURIComponent(reversingDelivery.id)}/reverse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reversalReason.trim() }),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Reversal failed with HTTP ${res.status}`);
      }

      setReversingDelivery(null);
      setReversalReason('');
      void fetchDeliveries();
    } catch (err: unknown) {
      setReversalError(err instanceof Error ? err.message : 'Delivery reversal failed');
    } finally {
      setReversalSubmitting(false);
    }
  };

  // Print Delivery Challan Document
  const handlePrintChallan = async (challanId: string) => {
    if (!selectedFacilityId) return;
    setPrintingId(challanId);
    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/documents/challan/${encodeURIComponent(challanId)}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string; message?: string };
        throw new Error(err.error ?? err.message ?? `Print failed (HTTP ${res.status})`);
      }
      const html = await res.text();
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Pop-up window was blocked. Please allow pop-ups for this site to print delivery challans.');
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate delivery challan');
    } finally {
      setPrintingId(null);
    }
  };

  // Filtered Deliveries
  const filteredDeliveries = useMemo(() => {
    if (!searchTerm.trim()) return deliveries;
    const term = searchTerm.toLowerCase();
    return deliveries.filter((d) => {
      const matchChallan = d.challanNumber.toLowerCase().includes(term);
      const matchGrn = d.grnNumber.toLowerCase().includes(term);
      const matchCust = d.customerName.toLowerCase().includes(term);
      const matchComm = d.commodityName.toLowerCase().includes(term);
      const matchVeh = d.vehicleNumber?.toLowerCase().includes(term) ?? false;
      const matchDriver = d.driverName?.toLowerCase().includes(term) ?? false;
      return matchChallan || matchGrn || matchCust || matchComm || matchVeh || matchDriver;
    });
  }, [deliveries, searchTerm]);

  // Columns definition
  const columns: DataTableColumn<DeliveryChallan>[] = [
    {
      key: 'challanNumber',
      header: 'Challan # / Date',
      render: (row) => (
        <div className={styles.challanCell}>
          <span className={styles.challanNumber}>{row.challanNumber}</span>
          <span className={styles.dateSub}>
            {new Date(row.date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN Source',
      render: (row) => <span style={{ fontWeight: 600 }}>{row.grnNumber}</span>,
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => <span>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity & Chamber',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>{row.commodityName}</span>
          <span className={styles.tagChamber}>Chamber {row.chamberNumber}</span>
        </div>
      ),
    },
    {
      key: 'totalBags',
      header: 'Delivered Bags',
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
          {row.totalBags.toLocaleString('en-IN')} bags
        </span>
      ),
    },
    {
      key: 'transport',
      header: 'Vehicle / Driver',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--text-xs)' }}>
          <span>Veh: {row.vehicleNumber || '—'}</span>
          <span>Driver: {row.driverName || '—'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <span className={row.status === 'ISSUED' ? styles.badgeIssued : styles.badgeReversed}>
          {row.status === 'ISSUED' ? (
            <>
              <CheckCircle2 size={12} aria-hidden="true" /> ISSUED
            </>
          ) : (
            <>
              <Clock size={12} aria-hidden="true" /> REVERSED
            </>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className={styles.actionGroup}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setSelectedDelivery(row)}
            title="View Details"
          >
            <Eye size={13} aria-hidden="true" />
            View
          </button>

          {canPrint && (
            <button
              type="button"
              className={styles.actionBtnPrimary}
              onClick={() => void handlePrintChallan(row.id)}
              disabled={printingId === row.id}
              title="Print Outward Delivery Challan & Gate Pass"
            >
              <Printer size={13} aria-hidden="true" />
              Challan
            </button>
          )}

          {row.status === 'ISSUED' && canReverse && (
            <button
              type="button"
              className={styles.actionBtnDanger}
              onClick={() => {
                setReversalError(null);
                setReversalReason('');
                setReversingDelivery(row);
              }}
              title="Reverse Delivery (Restores stock to positions)"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reverse
            </button>
          )}
        </div>
      ),
    },
  ];

  const currentFacilityName = useMemo(() => {
    return availableFacilities.find((f) => f.id === selectedFacilityId)?.name ?? selectedFacilityId;
  }, [availableFacilities, selectedFacilityId]);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Outward Deliveries</h1>
          <p className={styles.pageSub}>
            Delivery Challan issuance, position-level bag withdrawals, and gate pass management for{' '}
            {currentFacilityName}.
          </p>
        </div>

        <div className={styles.headerActions}>
          {canCreate && selectedFacilityId && (
            <button
              id="create-delivery-btn"
              type="button"
              className={styles.primaryBtn}
              onClick={openCreateModal}
            >
              <Plus size={16} aria-hidden="true" />
              Issue Delivery Challan
            </button>
          )}
        </div>
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message="Please select a facility from the top header to manage deliveries." />
      ) : (
        <>
          {/* Toolbar & Filters */}
          <div className={styles.toolbar}>
            <div className={styles.searchGroup}>
              <Search size={16} color="var(--color-text-muted)" aria-hidden="true" />
              <input
                id="delivery-search-input"
                type="text"
                placeholder="Search Challan #, GRN #, Customer, Vehicle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.filtersGroup}>
              <select
                id="delivery-status-filter"
                aria-label="Filter by Delivery Status"
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as '' | DeliveryStatus)}
              >
                <option value="">All Statuses</option>
                <option value="ISSUED">Issued (Active)</option>
                <option value="REVERSED">Reversed</option>
              </select>

              {(statusFilter || searchTerm) && (
                <button
                  type="button"
                  className={styles.clearFiltersBtn}
                  onClick={() => {
                    setStatusFilter('');
                    setSearchTerm('');
                  }}
                >
                  <Filter size={12} aria-hidden="true" />
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Table / Empty / Loading / Error */}
          {loading ? (
            <FeedbackStates.Loading label="Loading Delivery Challans..." />
          ) : error ? (
            <FeedbackStates.Error
              title="Error loading deliveries"
              message={error}
              onRetry={() => void fetchDeliveries()}
            />
          ) : deliveries.length === 0 ? (
            <FeedbackStates.Empty
              message={`No delivery challans recorded for ${currentFacilityName} yet.`}
              action={
                canCreate
                  ? {
                      label: '+ Issue Delivery Challan',
                      onClick: openCreateModal,
                      id: 'create-delivery-empty-btn',
                    }
                  : undefined
              }
            />
          ) : (
            <DataTable
              columns={columns}
              rows={filteredDeliveries}
              rowKey={(r) => r.id}
              caption={`Delivery Challans for ${currentFacilityName}`}
            />
          )}
        </>
      )}

      {/* Detail View Modal */}
      {selectedDelivery && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delivery-detail-title"
        >
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <h2 id="delivery-detail-title" className={styles.modalTitle}>
                  Delivery Challan: {selectedDelivery.challanNumber}
                </h2>
                <span className={styles.dateSub}>GRN Source: {selectedDelivery.grnNumber}</span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSelectedDelivery(null)}
                aria-label="Close details"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Delivery Date</span>
                  <span className={styles.detailValue}>
                    {new Date(selectedDelivery.date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Status</span>
                  <span className={styles.detailValue}>
                    <span
                      className={
                        selectedDelivery.status === 'ISSUED'
                          ? styles.badgeIssued
                          : styles.badgeReversed
                      }
                    >
                      {selectedDelivery.status}
                    </span>
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Customer</span>
                  <span className={styles.detailValue}>{selectedDelivery.customerName}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Commodity</span>
                  <span className={styles.detailValue}>{selectedDelivery.commodityName}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Chamber</span>
                  <span className={styles.detailValue}>Chamber {selectedDelivery.chamberNumber}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Total Delivered Bags</span>
                  <span className={styles.detailValue}>
                    {selectedDelivery.totalBags.toLocaleString('en-IN')} Bags
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Vehicle Number</span>
                  <span className={styles.detailValue}>
                    {selectedDelivery.vehicleNumber || 'None'}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Driver Name</span>
                  <span className={styles.detailValue}>
                    {selectedDelivery.driverName || 'None'}
                  </span>
                </div>

                <div className={styles.detailItem} style={{ gridColumn: 'span 2' }}>
                  <span className={styles.detailLabel}>Remarks</span>
                  <span className={styles.detailValue}>{selectedDelivery.remarks || 'None'}</span>
                </div>
              </div>

              {/* Itemized Withdrawn Positions */}
              <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase' }}>
                Withdrawn Positions ({selectedDelivery.items.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {selectedDelivery.items.map((item) => (
                  <div
                    key={item.positionId}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      background: 'var(--color-surface-2)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {item.positionCode}
                    </span>
                    <span style={{ fontWeight: 600 }}>{item.bags} bags withdrawn</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.modalFooter}>
              {canPrint && (
                <button
                  type="button"
                  className={styles.actionBtnPrimary}
                  onClick={() => void handlePrintChallan(selectedDelivery.id)}
                  disabled={printingId === selectedDelivery.id}
                >
                  <Printer size={15} aria-hidden="true" />
                  Print Delivery Challan
                </button>
              )}
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setSelectedDelivery(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Delivery Modal */}
      {isCreateOpen && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-delivery-title"
        >
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 id="create-delivery-title" className={styles.modalTitle}>
                Issue Outward Delivery Challan
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeCreateModal}
                aria-label="Close modal"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className={styles.modalBody}>
                {modalError && <div className={styles.modalError}>{modalError}</div>}

                {/* Step 1: GRN Source */}
                <div className={styles.fieldGroup}>
                  <label htmlFor="delivery-grn" className={styles.fieldLabel}>
                    Select Inward GRN *
                  </label>
                  <select
                    id="delivery-grn"
                    required
                    className={styles.fieldSelect}
                    value={createGrnId}
                    onChange={(e) => void handleSelectGrn(e.target.value)}
                  >
                    <option value="">Select an active GRN with stored stock</option>
                    {availableGrns.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.grnNumber} — {g.customerName} ({g.commodityName}, Chamber {g.chamberNumber})
                      </option>
                    ))}
                  </select>
                </div>

                {loadingGrnSummary ? (
                  <FeedbackStates.Loading label="Checking stored positions..." />
                ) : grnSummary && (
                  <>
                    {/* Position Allocation Breakdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <span className={styles.fieldLabel}>
                        Withdraw from Stored Positions *
                      </span>
                      <span className={styles.fieldHint}>
                        Enter the number of bags to withdraw from each storage position.
                      </span>

                      {withdrawals.length === 0 ? (
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)' }}>
                          No bags are currently put-away in positions for this GRN.
                        </p>
                      ) : (
                        withdrawals.map((w, idx) => (
                          <div key={w.positionId} className={styles.positionRow}>
                            <div>
                              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                                {w.positionCode}
                              </span>
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                                Available: {w.maxBags} bags
                              </span>
                            </div>
                            <input
                              type="number"
                              min={0}
                              max={w.maxBags}
                              placeholder="Bags to withdraw"
                              className={styles.fieldInput}
                              value={w.bags}
                              onChange={(e) => {
                                const val = e.target.value ? parseInt(e.target.value, 10) : '';
                                setWithdrawals((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, bags: val } : item)),
                                );
                              }}
                            />
                          </div>
                        ))
                      )}
                    </div>

                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      Total Delivering:{' '}
                      <span style={{ color: 'var(--color-primary)' }}>{totalWithdrawingBags}</span>{' '}
                      bags
                    </div>

                    {/* Transport & Logistics */}
                    <div className={styles.formGrid2}>
                      <div className={styles.fieldGroup}>
                        <label htmlFor="delivery-date" className={styles.fieldLabel}>
                          Delivery Date *
                        </label>
                        <input
                          id="delivery-date"
                          type="date"
                          required
                          className={styles.fieldInput}
                          value={createDate}
                          onChange={(e) => setCreateDate(e.target.value)}
                        />
                      </div>

                      <div className={styles.fieldGroup}>
                        <label htmlFor="delivery-vehicle" className={styles.fieldLabel}>
                          Vehicle Registration
                        </label>
                        <input
                          id="delivery-vehicle"
                          type="text"
                          maxLength={15}
                          className={styles.fieldInput}
                          placeholder="e.g. UP32AA1111"
                          value={createVehicleNumber}
                          onChange={(e) => setCreateVehicleNumber(e.target.value.toUpperCase())}
                        />
                      </div>
                    </div>

                    <div className={styles.formGrid2}>
                      <div className={styles.fieldGroup}>
                        <label htmlFor="delivery-driver" className={styles.fieldLabel}>
                          Driver Name
                        </label>
                        <input
                          id="delivery-driver"
                          type="text"
                          maxLength={100}
                          className={styles.fieldInput}
                          placeholder="e.g. Ramesh Singh"
                          value={createDriverName}
                          onChange={(e) => setCreateDriverName(e.target.value)}
                        />
                      </div>

                      <div className={styles.fieldGroup}>
                        <label htmlFor="delivery-weight" className={styles.fieldLabel}>
                          Dispatch Weight (kg)
                        </label>
                        <input
                          id="delivery-weight"
                          type="number"
                          step="0.01"
                          min={0}
                          className={styles.fieldInput}
                          placeholder="e.g. 12500"
                          value={createWeight}
                          onChange={(e) =>
                            setCreateWeight(e.target.value ? parseFloat(e.target.value) : '')
                          }
                        />
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label htmlFor="delivery-remarks" className={styles.fieldLabel}>
                        Remarks / Gate Pass Notes
                      </label>
                      <input
                        id="delivery-remarks"
                        type="text"
                        maxLength={500}
                        className={styles.fieldInput}
                        placeholder="Optional outward delivery notes"
                        value={createRemarks}
                        onChange={(e) => setCreateRemarks(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={closeCreateModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  id="submit-create-delivery-btn"
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submitting || totalWithdrawingBags <= 0}
                >
                  <Truck size={15} aria-hidden="true" />
                  {submitting ? 'Issuing...' : 'Issue Delivery Challan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {reversingDelivery && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                Confirm Full Reversal: {reversingDelivery.challanNumber}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setReversingDelivery(null)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleReverseSubmit}>
              <div className={styles.modalBody}>
                {reversalError && <div className={styles.modalError}>{reversalError}</div>}

                <div className={styles.warningBox}>
                  <AlertTriangle size={24} style={{ flexShrink: 0 }} aria-hidden="true" />
                  <div>
                    <strong>Warning: Full Reversal is Irreversible.</strong>
                    <p style={{ marginTop: '4px' }}>
                      Reversing this delivery will restore {reversingDelivery.totalBags} bags back
                      into their original storage positions and append an immutable{' '}
                      <code>DELIVERY_REVERSAL</code> event to the stock ledger.
                    </p>
                  </div>
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="reversal-reason" className={styles.fieldLabel}>
                    Reason for Reversal *
                  </label>
                  <textarea
                    id="reversal-reason"
                    required
                    rows={3}
                    minLength={5}
                    maxLength={500}
                    className={styles.fieldInput}
                    placeholder="Provide a mandatory operational justification (minimum 5 characters)..."
                    value={reversalReason}
                    onChange={(e) => setReversalReason(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setReversingDelivery(null)}
                  disabled={reversalSubmitting}
                >
                  Cancel
                </button>
                <button
                  id="confirm-reversal-btn"
                  type="submit"
                  className={styles.actionBtnDanger}
                  disabled={reversalSubmitting || reversalReason.trim().length < 5}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  {reversalSubmitting ? 'Reversing...' : 'Confirm Full Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
