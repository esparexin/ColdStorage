'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  Plus,
  Printer,
  Search,
  X,
} from 'lucide-react';
import {
  can,
  type BagType,
  type Chamber,
  type Commodity,
  type Customer,
  type Grn,
  type GrnStatus,
  type RentType,
  type Role,
} from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

export default function GrnsPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();

  // Data states
  const [grns, setGrns] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lookups
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [chambers, setChambers] = useState<Chamber[]>([]);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | GrnStatus>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [commodityFilter, setCommodityFilter] = useState('');

  // Selected GRN for detail modal
  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);

  // Printing state
  const [printingId, setPrintingId] = useState<string | null>(null);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createCommodityId, setCreateCommodityId] = useState('');
  const [createChamberId, setCreateChamberId] = useState('');
  const [createBags, setCreateBags] = useState<number | ''>('');
  const [createBagType, setCreateBagType] = useState<BagType>('S');
  const [createNominalUnitWeight, setCreateNominalUnitWeight] = useState<number | ''>('');
  const [createNominalTotalWeight, setCreateNominalTotalWeight] = useState<number | ''>('');
  const [createActualWeight, setCreateActualWeight] = useState<number | ''>('');
  const [createRentType, setCreateRentType] = useState<RentType>('Seasonal');
  const [createRentMonths, setCreateRentMonths] = useState<number | ''>('');
  const [createRentAmount, setCreateRentAmount] = useState<number | ''>('');
  const [createGpNumber, setCreateGpNumber] = useState('');
  const [createVehicleNumber, setCreateVehicleNumber] = useState('');
  const [createRemarks, setCreateRemarks] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // RBAC checks
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canCreate = can(userRole, 'grn:create');
  const canPrint = can(userRole, 'document:print');
  const canAllocate = can(userRole, 'rack:allocate');

  // Fetch Lookups
  const fetchLookups = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      const [custRes, commRes, chRes] = await Promise.all([
        requestWithAuth(`/api/customers?facilityId=${encodeURIComponent(selectedFacilityId)}`),
        requestWithAuth('/api/commodities'),
        requestWithAuth(`/api/facilities/${encodeURIComponent(selectedFacilityId)}/chambers`),
      ]);

      if (custRes.ok) {
        const data = (await custRes.json()) as { items?: Customer[] };
        setCustomers((data.items ?? []).filter((c) => c.isActive));
      }
      if (commRes.ok) {
        const data = (await commRes.json()) as { items?: Commodity[] };
        setCommodities((data.items ?? []).filter((c) => c.isActive));
      }
      if (chRes.ok) {
        const data = (await chRes.json()) as { items?: Chamber[] };
        setChambers((data.items ?? []).filter((c) => c.isActive));
      }
    } catch {
      // Lookups fail gracefully without halting UI
    }
  }, [selectedFacilityId]);

  // Fetch GRNs
  const fetchGrns = useCallback(async () => {
    if (!selectedFacilityId) {
      setGrns([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (statusFilter) params.set('status', statusFilter);
      if (customerFilter) params.set('customerId', customerFilter);
      if (commodityFilter) params.set('commodityId', commodityFilter);

      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?${params.toString()}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: Grn[] };
      setGrns(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Goods Receipt Notes');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId, statusFilter, customerFilter, commodityFilter]);

  useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    void fetchGrns();
  }, [fetchGrns]);

  // Filtered in-memory records
  const filteredGrns = useMemo(() => {
    if (!searchTerm.trim()) return grns;
    const term = searchTerm.toLowerCase();
    return grns.filter((g) => {
      const matchGrn = g.grnNumber.toLowerCase().includes(term);
      const matchReceipt = g.inwardReceiptNumber.toLowerCase().includes(term);
      const matchCustomer = g.customerName.toLowerCase().includes(term);
      const matchCommodity = g.commodityName.toLowerCase().includes(term);
      const matchGp = g.gpNumber?.toLowerCase().includes(term) ?? false;
      const matchVehicle = g.vehicleNumber?.toLowerCase().includes(term) ?? false;
      return matchGrn || matchReceipt || matchCustomer || matchCommodity || matchGp || matchVehicle;
    });
  }, [grns, searchTerm]);

  // Handle Document Printing
  const handlePrint = async (type: 'grn' | 'receipt', grnId: string) => {
    if (!selectedFacilityId) return;
    setPrintingId(`${type}-${grnId}`);
    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/documents/${type}/${encodeURIComponent(grnId)}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string; message?: string };
        throw new Error(err.error ?? err.message ?? `Print failed (HTTP ${res.status})`);
      }
      const html = await res.text();
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Pop-up window was blocked. Please allow pop-ups for this site to print documents.');
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
      alert(err instanceof Error ? err.message : 'Failed to generate document');
    } finally {
      setPrintingId(null);
    }
  };

  // Open Create Modal
  const openCreateModal = () => {
    setCreateDate(new Date().toISOString().split('T')[0]);
    setCreateCustomerId(customers[0]?.id ?? '');
    setCreateCommodityId(commodities[0]?.id ?? '');
    setCreateChamberId(chambers[0]?.id ?? '');
    setCreateBags('');
    setCreateBagType('S');
    setCreateNominalUnitWeight('');
    setCreateNominalTotalWeight('');
    setCreateActualWeight('');
    setCreateRentType('Seasonal');
    setCreateRentMonths('');
    setCreateRentAmount('');
    setCreateGpNumber('');
    setCreateVehicleNumber('');
    setCreateRemarks('');
    setModalError(null);
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setModalError(null);
  };

  // Auto-calculate nominal total weight when bags or unit weight changes
  const handleBagsChange = (val: number | '') => {
    setCreateBags(val);
    if (typeof val === 'number' && typeof createNominalUnitWeight === 'number') {
      setCreateNominalTotalWeight(val * createNominalUnitWeight);
    }
  };

  const handleUnitWeightChange = (val: number | '') => {
    setCreateNominalUnitWeight(val);
    if (typeof createBags === 'number' && typeof val === 'number') {
      setCreateNominalTotalWeight(createBags * val);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId) return;

    if (!createCustomerId) {
      setModalError('Please select a customer');
      return;
    }
    if (!createCommodityId) {
      setModalError('Please select a commodity');
      return;
    }
    if (!createChamberId) {
      setModalError('Please select a chamber');
      return;
    }
    if (typeof createBags !== 'number' || createBags <= 0) {
      setModalError('Bags count must be a positive integer');
      return;
    }
    if (createRentType === 'Monthly' && (typeof createRentMonths !== 'number' || createRentMonths < 1)) {
      setModalError('Rent months is required (>= 1) for Monthly rent');
      return;
    }
    if (typeof createRentAmount !== 'number' || createRentAmount < 0) {
      setModalError('Rent amount must be greater than or equal to 0');
      return;
    }

    if (createVehicleNumber.trim()) {
      const vehicleRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{1,4}$/;
      if (!vehicleRegex.test(createVehicleNumber.trim().toUpperCase())) {
        setModalError('Vehicle number must be in standard Indian format (e.g., UP32AA1111)');
        return;
      }
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const payload: Record<string, unknown> = {
        facilityId: selectedFacilityId,
        date: new Date(createDate),
        customerId: createCustomerId,
        commodityId: createCommodityId,
        chamberId: createChamberId,
        bags: createBags,
        bagType: createBagType,
        rentType: createRentType,
        rentAmount: createRentAmount,
      };

      if (createRentType === 'Monthly' && typeof createRentMonths === 'number') {
        payload.rentMonths = createRentMonths;
      }

      if (typeof createNominalUnitWeight === 'number' && createNominalUnitWeight > 0) {
        payload.nominalUnitWeight = createNominalUnitWeight;
      }
      if (typeof createNominalTotalWeight === 'number' && createNominalTotalWeight > 0) {
        payload.nominalTotalWeight = createNominalTotalWeight;
      }
      if (typeof createActualWeight === 'number' && createActualWeight > 0) {
        payload.actualWeight = createActualWeight;
      }
      if (createGpNumber.trim()) {
        payload.gpNumber = createGpNumber.trim();
      }
      if (createVehicleNumber.trim()) {
        payload.vehicleNumber = createVehicleNumber.trim().toUpperCase();
      }
      if (createRemarks.trim()) {
        payload.remarks = createRemarks.trim();
      }

      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string; details?: unknown };
        throw new Error(data.error ?? `Creation failed with HTTP ${res.status}`);
      }

      const responseData = (await res.json()) as { grn: Grn };
      closeCreateModal();
      void fetchGrns();

      // Show detail view of newly created GRN immediately
      if (responseData.grn) {
        setSelectedGrn(responseData.grn);
      }
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to create GRN');
    } finally {
      setSubmitting(false);
    }
  };

  // Table Columns Definition
  const columns: DataTableColumn<Grn>[] = [
    {
      key: 'grnNumber',
      header: 'GRN / Receipt #',
      render: (row) => (
        <div className={styles.grnCell}>
          <span className={styles.grnNumber}>{row.grnNumber}</span>
          <span className={styles.receiptNumber}>Receipt: {row.inwardReceiptNumber}</span>
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
      key: 'bags',
      header: 'Bags & Type',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
          <span style={{ fontWeight: 600 }}>{row.bags.toLocaleString('en-IN')} bags</span>
          <span className={styles.tagBagType}>Type: {row.bagType}</span>
          {row.authoritativeWeight && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {row.authoritativeWeight} kg
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'rent',
      header: 'Rent Terms',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>
            {row.rentType}
            {row.rentType === 'Monthly' && row.rentMonths ? ` (${row.rentMonths}m)` : ''}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            ₹{row.rentAmount.toLocaleString('en-IN')}
          </span>
        </div>
      ),
    },
    {
      key: 'identifiers',
      header: 'GP / Vehicle',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--text-xs)' }}>
          <span>GP: {row.gpNumber || '—'}</span>
          <span>Veh: {row.vehicleNumber || '—'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <span className={row.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed}>
          {row.status === 'OPEN' ? (
            <>
              <Clock size={12} aria-hidden="true" /> OPEN
            </>
          ) : (
            <>
              <CheckCircle2 size={12} aria-hidden="true" /> CLOSED
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
            onClick={() => setSelectedGrn(row)}
            title="View Details"
          >
            <Eye size={13} aria-hidden="true" />
            View
          </button>

          {canPrint && (
            <>
              <button
                type="button"
                className={styles.actionBtnPrimary}
                onClick={() => void handlePrint('grn', row.id)}
                disabled={printingId === `grn-${row.id}`}
                title="Print Official GRN"
              >
                <Printer size={13} aria-hidden="true" />
                GRN
              </button>
              <button
                type="button"
                className={styles.actionBtnSuccess}
                onClick={() => void handlePrint('receipt', row.id)}
                disabled={printingId === `receipt-${row.id}`}
                title="Print Farmer Inward Receipt"
              >
                <FileText size={13} aria-hidden="true" />
                Ack
              </button>
            </>
          )}

          {row.status === 'OPEN' && canAllocate && (
            <Link
              href={`/inventory?grnId=${encodeURIComponent(row.id)}`}
              className={styles.actionBtn}
              title="Put Away Bags to Racks/Positions"
            >
              <ArrowRight size={13} aria-hidden="true" />
              Put-Away
            </Link>
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
          <h1 className={styles.pageTitle}>Goods Receipt Notes (GRN)</h1>
          <p className={styles.pageSub}>
            Inward stock recording, weight accounting, storage allocation & official documentation.
          </p>
        </div>

        <div className={styles.headerActions}>
          {canCreate && selectedFacilityId && (
            <button
              id="create-grn-header-btn"
              type="button"
              className={styles.primaryBtn}
              onClick={openCreateModal}
            >
              <Plus size={16} aria-hidden="true" />
              Create Inward GRN
            </button>
          )}
        </div>
      </div>

      {/* Facility Unselected Notice */}
      {!selectedFacilityId ? (
        <FeedbackStates.Empty
          message="Please select a facility from the top header to manage Goods Receipt Notes."
        />
      ) : (
        <>
          {/* Toolbar & Filters */}
          <div className={styles.toolbar}>
            <div className={styles.searchGroup}>
              <Search size={16} color="var(--color-text-muted)" aria-hidden="true" />
              <input
                id="grn-search-input"
                type="text"
                placeholder="Search GRN #, Receipt, Customer, Vehicle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.filtersGroup}>
              <select
                id="grn-status-filter"
                aria-label="Filter by GRN Status"
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as '' | GrnStatus)}
              >
                <option value="">All Statuses</option>
                <option value="OPEN">Open (Active)</option>
                <option value="CLOSED">Closed (Completed)</option>
              </select>

              <select
                id="grn-customer-filter"
                aria-label="Filter by Customer"
                className={styles.filterSelect}
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
              >
                <option value="">All Customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                id="grn-commodity-filter"
                aria-label="Filter by Commodity"
                className={styles.filterSelect}
                value={commodityFilter}
                onChange={(e) => setCommodityFilter(e.target.value)}
              >
                <option value="">All Commodities</option>
                {commodities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {(statusFilter || customerFilter || commodityFilter || searchTerm) && (
                <button
                  type="button"
                  className={styles.clearFiltersBtn}
                  onClick={() => {
                    setStatusFilter('');
                    setCustomerFilter('');
                    setCommodityFilter('');
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
            <FeedbackStates.Loading label="Loading Goods Receipt Notes..." />
          ) : error ? (
            <FeedbackStates.Error
              title="Error loading GRNs"
              message={error}
              onRetry={() => void fetchGrns()}
            />
          ) : grns.length === 0 ? (
            <FeedbackStates.Empty
              message={`No Goods Receipt Notes recorded for ${currentFacilityName} yet.`}
              action={
                canCreate
                  ? {
                      label: '+ Create Inward GRN',
                      onClick: openCreateModal,
                      id: 'create-grn-empty-btn',
                    }
                  : undefined
              }
            />
          ) : (
            <DataTable
              columns={columns}
              rows={filteredGrns}
              rowKey={(r) => r.id}
              caption={`Goods Receipt Notes for ${currentFacilityName}`}
            />
          )}
        </>
      )}

      {/* Detail View Modal */}
      {selectedGrn && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
        >
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <h2 id="detail-modal-title" className={styles.modalTitle}>
                  GRN Details: {selectedGrn.grnNumber}
                </h2>
                <span className={styles.receiptNumber}>
                  Inward Receipt #{selectedGrn.inwardReceiptNumber}
                </span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSelectedGrn(null)}
                aria-label="Close details"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Inward Date</span>
                  <span className={styles.detailValue}>
                    {new Date(selectedGrn.date).toLocaleDateString('en-IN', {
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
                        selectedGrn.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed
                      }
                    >
                      {selectedGrn.status}
                    </span>
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Customer</span>
                  <span className={styles.detailValue}>{selectedGrn.customerName}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Commodity</span>
                  <span className={styles.detailValue}>{selectedGrn.commodityName}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Chamber</span>
                  <span className={styles.detailValue}>Chamber {selectedGrn.chamberNumber}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Bags Accounting</span>
                  <span className={styles.detailValue}>
                    {selectedGrn.bags.toLocaleString('en-IN')} Bags (Type: {selectedGrn.bagType})
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Authoritative Weight</span>
                  <span className={styles.detailValue}>
                    {selectedGrn.authoritativeWeight
                      ? `${selectedGrn.authoritativeWeight} kg`
                      : 'Not recorded'}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Rent Structure</span>
                  <span className={styles.detailValue}>
                    {selectedGrn.rentType}
                    {selectedGrn.rentType === 'Monthly' && selectedGrn.rentMonths
                      ? ` (${selectedGrn.rentMonths} Months)`
                      : ''}{' '}
                    — ₹{selectedGrn.rentAmount.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Gate Pass (GP) #</span>
                  <span className={styles.detailValue}>{selectedGrn.gpNumber || 'None'}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Vehicle Registration</span>
                  <span className={styles.detailValue}>
                    {selectedGrn.vehicleNumber || 'None'}
                  </span>
                </div>

                <div className={styles.detailItem} style={{ gridColumn: 'span 2' }}>
                  <span className={styles.detailLabel}>Remarks</span>
                  <span className={styles.detailValue}>{selectedGrn.remarks || 'None'}</span>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              {canPrint && (
                <>
                  <button
                    type="button"
                    className={styles.actionBtnPrimary}
                    onClick={() => void handlePrint('grn', selectedGrn.id)}
                    disabled={printingId === `grn-${selectedGrn.id}`}
                  >
                    <Printer size={15} aria-hidden="true" />
                    Print Official GRN
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtnSuccess}
                    onClick={() => void handlePrint('receipt', selectedGrn.id)}
                    disabled={printingId === `receipt-${selectedGrn.id}`}
                  >
                    <FileText size={15} aria-hidden="true" />
                    Print Inward Receipt
                  </button>
                </>
              )}
              {selectedGrn.status === 'OPEN' && canAllocate && (
                <Link
                  href={`/inventory?grnId=${encodeURIComponent(selectedGrn.id)}`}
                  className={styles.primaryBtn}
                >
                  <ArrowRight size={15} aria-hidden="true" />
                  Put-Away Bags
                </Link>
              )}
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setSelectedGrn(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Inward GRN Modal */}
      {isCreateOpen && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-modal-title"
        >
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 id="create-modal-title" className={styles.modalTitle}>
                Inward Goods Receipt Note (GRN)
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

            <form onSubmit={handleCreateSubmit} className={styles.modalForm}>
              <div className={styles.modalBody}>
                {modalError && <div className={styles.modalError}>{modalError}</div>}

                {/* Section 1: Inward & Entity Information */}
                <h3 className={styles.sectionHeading}>Basic Information</h3>
                <div className={styles.formGrid3}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-date" className={styles.fieldLabel}>
                      Inward Date *
                    </label>
                    <input
                      id="create-date"
                      type="date"
                      required
                      value={createDate}
                      onChange={(e) => setCreateDate(e.target.value)}
                      className={styles.fieldInput}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-customer" className={styles.fieldLabel}>
                      Customer *
                    </label>
                    <select
                      id="create-customer"
                      required
                      value={createCustomerId}
                      onChange={(e) => setCreateCustomerId(e.target.value)}
                      className={styles.fieldSelect}
                    >
                      <option value="">Select Customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.mobile})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-commodity" className={styles.fieldLabel}>
                      Commodity *
                    </label>
                    <select
                      id="create-commodity"
                      required
                      value={createCommodityId}
                      onChange={(e) => setCreateCommodityId(e.target.value)}
                      className={styles.fieldSelect}
                    >
                      <option value="">Select Commodity</option>
                      {commodities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.formGrid2}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-chamber" className={styles.fieldLabel}>
                      Chamber *
                    </label>
                    <select
                      id="create-chamber"
                      required
                      value={createChamberId}
                      onChange={(e) => setCreateChamberId(e.target.value)}
                      className={styles.fieldSelect}
                    >
                      <option value="">Select Chamber</option>
                      {chambers.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          Chamber {ch.chamberNumber}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-bag-type" className={styles.fieldLabel}>
                      Bag Type *
                    </label>
                    <select
                      id="create-bag-type"
                      required
                      value={createBagType}
                      onChange={(e) => setCreateBagType(e.target.value as BagType)}
                      className={styles.fieldSelect}
                    >
                      <option value="S">S (Small)</option>
                      <option value="B">B (Big)</option>
                      <option value="S+B">S+B (Mixed)</option>
                    </select>
                  </div>
                </div>

                {/* Section 2: Bag & Weight Accounting */}
                <h3 className={styles.sectionHeading}>Quantity & Weight Accounting</h3>
                <div className={styles.formGrid2}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-bags" className={styles.fieldLabel}>
                      Total Bags *
                    </label>
                    <input
                      id="create-bags"
                      type="number"
                      required
                      min={1}
                      max={100000}
                      value={createBags}
                      onChange={(e) =>
                        handleBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')
                      }
                      placeholder="e.g. 250"
                      className={styles.fieldInput}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-actual-weight" className={styles.fieldLabel}>
                      Weighbridge Weight (kg)
                    </label>
                    <input
                      id="create-actual-weight"
                      type="number"
                      step="0.01"
                      min={0}
                      value={createActualWeight}
                      onChange={(e) =>
                        setCreateActualWeight(e.target.value ? parseFloat(e.target.value) : '')
                      }
                      placeholder="e.g. 12500"
                      className={styles.fieldInput}
                    />
                    <span className={styles.fieldHint}>
                      Authoritative when entered. Falls back to nominal total weight.
                    </span>
                  </div>
                </div>

                <div className={styles.formGrid2}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-unit-weight" className={styles.fieldLabel}>
                      Nominal Unit Weight (kg/bag)
                    </label>
                    <input
                      id="create-unit-weight"
                      type="number"
                      step="0.01"
                      min={0}
                      value={createNominalUnitWeight}
                      onChange={(e) =>
                        handleUnitWeightChange(e.target.value ? parseFloat(e.target.value) : '')
                      }
                      placeholder="e.g. 50"
                      className={styles.fieldInput}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-total-weight" className={styles.fieldLabel}>
                      Nominal Total Weight (kg)
                    </label>
                    <input
                      id="create-total-weight"
                      type="number"
                      step="0.01"
                      min={0}
                      value={createNominalTotalWeight}
                      onChange={(e) =>
                        setCreateNominalTotalWeight(
                          e.target.value ? parseFloat(e.target.value) : '',
                        )
                      }
                      placeholder="Auto-calculated (bags × unit weight)"
                      className={styles.fieldInput}
                    />
                  </div>
                </div>

                {/* Section 3: Rent Terms */}
                <h3 className={styles.sectionHeading}>Rent Terms</h3>
                <div className={styles.formGrid3}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-rent-type" className={styles.fieldLabel}>
                      Rent Type *
                    </label>
                    <select
                      id="create-rent-type"
                      required
                      value={createRentType}
                      onChange={(e) => setCreateRentType(e.target.value as RentType)}
                      className={styles.fieldSelect}
                    >
                      <option value="Seasonal">Seasonal</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-rent-months" className={styles.fieldLabel}>
                      Rent Months {createRentType === 'Monthly' ? '*' : ''}
                    </label>
                    <input
                      id="create-rent-months"
                      type="number"
                      min={1}
                      disabled={createRentType !== 'Monthly'}
                      required={createRentType === 'Monthly'}
                      value={createRentMonths}
                      onChange={(e) =>
                        setCreateRentMonths(e.target.value ? parseInt(e.target.value, 10) : '')
                      }
                      placeholder={createRentType === 'Monthly' ? 'e.g. 6' : 'N/A for Seasonal'}
                      className={styles.fieldInput}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-rent-amount" className={styles.fieldLabel}>
                      Rent Amount (₹) *
                    </label>
                    <input
                      id="create-rent-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={createRentAmount}
                      onChange={(e) =>
                        setCreateRentAmount(e.target.value ? parseFloat(e.target.value) : '')
                      }
                      placeholder="e.g. 15000"
                      className={styles.fieldInput}
                    />
                  </div>
                </div>

                {/* Section 4: Transport & Identifiers */}
                <h3 className={styles.sectionHeading}>Transport & Logistics</h3>
                <div className={styles.formGrid2}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-gp" className={styles.fieldLabel}>
                      Gate Pass (GP) #
                    </label>
                    <input
                      id="create-gp"
                      type="text"
                      maxLength={40}
                      value={createGpNumber}
                      onChange={(e) => setCreateGpNumber(e.target.value)}
                      placeholder="e.g. GP-2026-09"
                      className={styles.fieldInput}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-vehicle" className={styles.fieldLabel}>
                      Vehicle Registration
                    </label>
                    <input
                      id="create-vehicle"
                      type="text"
                      maxLength={15}
                      value={createVehicleNumber}
                      onChange={(e) => setCreateVehicleNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. UP32AA1111"
                      className={styles.fieldInput}
                    />
                  </div>
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="create-remarks" className={styles.fieldLabel}>
                    Remarks / Notes
                  </label>
                  <textarea
                    id="create-remarks"
                    rows={2}
                    maxLength={500}
                    value={createRemarks}
                    onChange={(e) => setCreateRemarks(e.target.value)}
                    placeholder="Optional inward inspection notes or quality observations"
                    className={styles.fieldInput}
                  />
                </div>
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
                  id="submit-create-grn-btn"
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submitting}
                >
                  {submitting ? 'Creating...' : 'Create Inward GRN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
