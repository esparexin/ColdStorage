'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  Filter,
  IndianRupee,
  Plus,
  Printer,
  Receipt,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import {
  can,
  type PaymentMode,
  type PaymentStatus,
  type RentSummaryDto,
  type Role,
} from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

interface GrnListItem {
  id: string;
  grnNumber: string;
}

export default function RentPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();

  // Data states
  const [rentSummaries, setRentSummaries] = useState<RentSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | PaymentStatus>('');

  // Selected account for Collect Payment modal
  const [collectAccount, setCollectAccount] = useState<RentSummaryDto | null>(null);
  const [collectAmount, setCollectAmount] = useState<number | ''>('');
  const [collectMode, setCollectMode] = useState<PaymentMode>('Cash');
  const [collectDate, setCollectDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [collectNotes, setCollectNotes] = useState('');
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectSubmitting, setCollectSubmitting] = useState(false);

  // Selected account for Payment History modal
  const [historyAccount, setHistoryAccount] = useState<RentSummaryDto | null>(null);

  // Printing state
  const [printingReceiptNum, setPrintingReceiptNum] = useState<string | null>(null);

  // RBAC checks
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canCollect = can(userRole, 'rent:collect');
  const canPrint = can(userRole, 'rent:print');

  // Fetch Rent Accounts for Facility
  const fetchRentAccounts = useCallback(async () => {
    if (!selectedFacilityId) {
      setRentSummaries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1. Fetch GRNs for the facility
      const grnRes = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?limit=100`,
      );
      if (!grnRes.ok) {
        const err = (await grnRes.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${grnRes.status}`);
      }
      const grnData = (await grnRes.json()) as { items?: GrnListItem[] };
      const grns = grnData.items ?? [];

      // 2. Fetch rent summaries for each GRN in parallel
      const summaries: RentSummaryDto[] = [];
      const results = await Promise.allSettled(
        grns.map(async (g) => {
          const res = await requestWithAuth(
            `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/grn/${encodeURIComponent(g.id)}`,
          );
          if (res.ok) {
            return (await res.json()) as RentSummaryDto;
          }
          return null;
        }),
      );

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          summaries.push(res.value);
        }
      }

      setRentSummaries(summaries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rent billing accounts');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchRentAccounts();
  }, [fetchRentAccounts]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;

    for (const acc of rentSummaries) {
      totalBilled += acc.rentAmount;
      totalCollected += acc.totalPaid;
      totalOutstanding += acc.remainingBalance;
    }

    return { totalBilled, totalCollected, totalOutstanding };
  }, [rentSummaries]);

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return rentSummaries.filter((acc) => {
      const matchSearch =
        !searchTerm.trim() ||
        acc.grnNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.customerMobile.includes(searchTerm.trim()) ||
        acc.commodityName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = !statusFilter || acc.paymentStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rentSummaries, searchTerm, statusFilter]);

  // Open Collect Payment Modal
  const openCollectModal = (acc: RentSummaryDto) => {
    setCollectAccount(acc);
    setCollectAmount(acc.remainingBalance > 0 ? acc.remainingBalance : '');
    setCollectMode('Cash');
    setCollectDate(new Date().toISOString().split('T')[0]);
    setCollectNotes('');
    setCollectError(null);
  };

  // Submit Rent Payment
  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId || !collectAccount) return;

    if (typeof collectAmount !== 'number' || collectAmount <= 0) {
      setCollectError('Payment amount must be greater than zero');
      return;
    }

    if (collectAmount > collectAccount.remainingBalance) {
      setCollectError(
        `Amount (₹${collectAmount}) exceeds remaining balance of ₹${collectAccount.remainingBalance}`,
      );
      return;
    }

    setCollectSubmitting(true);
    setCollectError(null);

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/collect`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grnId: collectAccount.grnId,
            amountPaid: collectAmount,
            paymentMode: collectMode,
            paymentDate: new Date(collectDate),
            notes: collectNotes.trim() || undefined,
          }),
        },
      );

      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? `Payment failed with HTTP ${res.status}`);
      }

      const result = (await res.json()) as {
        payment: { receiptNumber: string };
        summary: RentSummaryDto;
      };

      setCollectAccount(null);
      void fetchRentAccounts();

      // Open history modal for immediate receipt printing
      if (result.summary) {
        setHistoryAccount(result.summary);
      }
    } catch (err: unknown) {
      setCollectError(err instanceof Error ? err.message : 'Failed to collect payment');
    } finally {
      setCollectSubmitting(false);
    }
  };

  // Print Official Rent Receipt
  const handlePrintReceipt = async (receiptNumber: string) => {
    if (!selectedFacilityId) return;
    setPrintingReceiptNum(receiptNumber);
    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/receipts/${encodeURIComponent(receiptNumber)}/print`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Print failed (HTTP ${res.status})`);
      }
      const html = await res.text();
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Pop-up window was blocked. Please allow pop-ups for this site to print rent receipts.');
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
      alert(err instanceof Error ? err.message : 'Failed to generate rent receipt');
    } finally {
      setPrintingReceiptNum(null);
    }
  };

  // Preview Receipt (Zero Mutations)
  const handlePreviewReceipt = async () => {
    if (!selectedFacilityId || !collectAccount || typeof collectAmount !== 'number') return;
    try {
      const params = new URLSearchParams({
        customerName: collectAccount.customerName,
        customerMobile: collectAccount.customerMobile,
        amount: String(collectAmount),
        paymentMode: collectMode,
      });
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/documents/rent-receipt/preview?${params.toString()}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Receipt preview failed');
      }
      const html = await res.text();
      const previewWindow = window.open('', '_blank');
      if (!previewWindow) {
        alert('Pop-up window was blocked.');
        return;
      }
      previewWindow.document.open();
      previewWindow.document.write(html);
      previewWindow.document.close();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to preview receipt');
    }
  };

  // Columns definition
  const columns: DataTableColumn<RentSummaryDto>[] = [
    {
      key: 'grnNumber',
      header: 'GRN # / Date',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600 }}>{row.grnNumber}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {new Date(row.inwardDate).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span>{row.customerName}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {row.customerMobile}
          </span>
        </div>
      ),
    },
    {
      key: 'commodity',
      header: 'Commodity & Chamber',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>{row.commodityName}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Chamber {row.chamberNumber} ({row.totalBags} bags)
          </span>
        </div>
      ),
    },
    {
      key: 'structure',
      header: 'Rent Structure',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>
            {row.rentType}
            {row.rentType === 'Monthly' && row.rentMonths ? ` (${row.rentMonths}m)` : ''}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            ₹{row.rentAmount.toLocaleString('en-IN')}
          </span>
        </div>
      ),
    },
    {
      key: 'accounting',
      header: 'Paid / Balance',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>
            Paid: ₹{row.totalPaid.toLocaleString('en-IN')}
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: row.remainingBalance > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)',
            }}
          >
            Due: ₹{row.remainingBalance.toLocaleString('en-IN')}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <span
          className={row.paymentStatus === 'Settled' ? styles.badgeSettled : styles.badgeDue}
        >
          {row.paymentStatus === 'Settled' ? (
            <>
              <CheckCircle2 size={12} aria-hidden="true" /> Settled
            </>
          ) : (
            <>
              <Clock size={12} aria-hidden="true" /> Not Settled
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
          {row.paymentStatus !== 'Settled' && canCollect && (
            <button
              type="button"
              className={styles.actionBtnPrimary}
              onClick={() => openCollectModal(row)}
              title="Collect rent payment"
            >
              <Plus size={13} aria-hidden="true" />
              Collect
            </button>
          )}

          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setHistoryAccount(row)}
            title="View payment receipts history"
          >
            <Eye size={13} aria-hidden="true" />
            Receipts ({row.payments.length})
          </button>
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
          <h1 className={styles.pageTitle}>Rent Billing & Payment Collection</h1>
          <p className={styles.pageSub}>
            Customer rent accounts, cash & UPI collections, and official FY rent receipts for{' '}
            {currentFacilityName}.
          </p>
        </div>
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message="Please select a facility from the top header to manage rent billing." />
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrap}>
                <IndianRupee size={24} aria-hidden="true" />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Total Rent Billed</span>
                <span className={styles.kpiValue}>
                  ₹{metrics.totalBilled.toLocaleString('en-IN')}
                </span>
                <span className={styles.kpiSub}>Contractual obligations</span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrapSuccess}>
                <Receipt size={24} aria-hidden="true" />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Total Rent Collected</span>
                <span className={styles.kpiValue} style={{ color: 'var(--color-success)' }}>
                  ₹{metrics.totalCollected.toLocaleString('en-IN')}
                </span>
                <span className={styles.kpiSub}>Realized payments received</span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrapWarning}>
                <Wallet size={24} aria-hidden="true" />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Outstanding Dues</span>
                <span className={styles.kpiValue} style={{ color: 'var(--color-warning)' }}>
                  ₹{metrics.totalOutstanding.toLocaleString('en-IN')}
                </span>
                <span className={styles.kpiSub}>Pending balance to be collected</span>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.searchGroup}>
              <Search size={16} color="var(--color-text-muted)" aria-hidden="true" />
              <input
                id="rent-search-input"
                type="text"
                placeholder="Search GRN #, Customer, Mobile, Commodity..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.filtersGroup}>
              <select
                id="rent-status-filter"
                aria-label="Filter by Payment Status"
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as '' | PaymentStatus)}
              >
                <option value="">All Payment Statuses</option>
                <option value="Not Settled">Not Settled (Pending Dues)</option>
                <option value="Settled">Settled (Fully Paid)</option>
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
            <FeedbackStates.Loading label="Loading rent billing accounts..." />
          ) : error ? (
            <FeedbackStates.Error
              title="Error loading rent accounts"
              message={error}
              onRetry={() => void fetchRentAccounts()}
            />
          ) : rentSummaries.length === 0 ? (
            <FeedbackStates.Empty
              message={`No rent accounts recorded for ${currentFacilityName} yet.`}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={filteredAccounts}
              rowKey={(r) => r.grnId}
              caption={`Rent Accounts for ${currentFacilityName}`}
            />
          )}
        </>
      )}

      {/* Collect Payment Modal */}
      {collectAccount && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="collect-payment-title"
        >
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 id="collect-payment-title" className={styles.modalTitle}>
                Collect Rent Payment
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setCollectAccount(null)}
                aria-label="Close modal"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCollectSubmit}>
              <div className={styles.modalBody}>
                {collectError && <div className={styles.modalError}>{collectError}</div>}

                {/* Account Summary Card */}
                <div className={styles.infoCard}>
                  <div className={styles.infoRow}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Customer</span>
                    <strong>{collectAccount.customerName}</strong>
                  </div>
                  <div className={styles.infoRow}>
                    <span style={{ color: 'var(--color-text-muted)' }}>GRN Reference</span>
                    <span>{collectAccount.grnNumber}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Total Contract Rent</span>
                    <span>₹{collectAccount.rentAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Total Already Paid</span>
                    <span style={{ color: 'var(--color-success)' }}>
                      ₹{collectAccount.totalPaid.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className={styles.infoRow} style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Remaining Due</span>
                    <strong style={{ color: 'var(--color-warning)', fontSize: 'var(--text-base)' }}>
                      ₹{collectAccount.remainingBalance.toLocaleString('en-IN')}
                    </strong>
                  </div>
                </div>

                {/* Amount Input with Quick Fill */}
                <div className={styles.fieldGroup}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label htmlFor="collect-amount" className={styles.fieldLabel}>
                      Amount to Collect (₹) *
                    </label>
                    {collectAccount.remainingBalance > 0 && (
                      <button
                        type="button"
                        className={styles.quickFillBtn}
                        onClick={() => setCollectAmount(collectAccount.remainingBalance)}
                      >
                        Pay Full Balance (₹{collectAccount.remainingBalance})
                      </button>
                    )}
                  </div>
                  <input
                    id="collect-amount"
                    type="number"
                    min={1}
                    max={collectAccount.remainingBalance}
                    step="0.01"
                    required
                    className={styles.fieldInput}
                    placeholder="Enter amount"
                    value={collectAmount}
                    onChange={(e) =>
                      setCollectAmount(e.target.value ? parseFloat(e.target.value) : '')
                    }
                  />
                </div>

                {/* Payment Mode Selector */}
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Payment Mode *</span>
                  <div className={styles.modeToggleGroup}>
                    <button
                      type="button"
                      className={`${styles.modeOption} ${collectMode === 'Cash' ? styles.modeOptionActive : ''}`}
                      onClick={() => setCollectMode('Cash')}
                    >
                      <Wallet size={16} aria-hidden="true" />
                      Cash
                    </button>
                    <button
                      type="button"
                      className={`${styles.modeOption} ${collectMode === 'UPI' ? styles.modeOptionActive : ''}`}
                      onClick={() => setCollectMode('UPI')}
                    >
                      <CreditCard size={16} aria-hidden="true" />
                      UPI
                    </button>
                  </div>
                </div>

                {/* Date Input */}
                <div className={styles.fieldGroup}>
                  <label htmlFor="collect-date" className={styles.fieldLabel}>
                    Payment Date *
                  </label>
                  <input
                    id="collect-date"
                    type="date"
                    required
                    className={styles.fieldInput}
                    value={collectDate}
                    onChange={(e) => setCollectDate(e.target.value)}
                  />
                </div>

                {/* Notes Input */}
                <div className={styles.fieldGroup}>
                  <label htmlFor="collect-notes" className={styles.fieldLabel}>
                    Receipt Notes / UPI Reference ID
                  </label>
                  <input
                    id="collect-notes"
                    type="text"
                    maxLength={500}
                    className={styles.fieldInput}
                    placeholder="Optional notes or bank transaction reference"
                    value={collectNotes}
                    onChange={(e) => setCollectNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                {canPrint && typeof collectAmount === 'number' && collectAmount > 0 && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => void handlePreviewReceipt()}
                  >
                    <Eye size={14} aria-hidden="true" />
                    Preview Receipt
                  </button>
                )}
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setCollectAccount(null)}
                  disabled={collectSubmitting}
                >
                  Cancel
                </button>
                <button
                  id="confirm-collect-payment-btn"
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={collectSubmitting || typeof collectAmount !== 'number' || collectAmount <= 0}
                >
                  {collectSubmitting ? 'Recording...' : 'Collect & Issue Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment History & Receipts Modal */}
      {historyAccount && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-title"
        >
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <h2 id="history-title" className={styles.modalTitle}>
                  Rent Receipts: {historyAccount.grnNumber}
                </h2>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Customer: {historyAccount.customerName} ({historyAccount.customerMobile})
                </span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setHistoryAccount(null)}
                aria-label="Close modal"
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
                <div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Total Billed
                  </span>
                  <div style={{ fontWeight: 700 }}>
                    ₹{historyAccount.rentAmount.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Total Paid
                  </span>
                  <div style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                    ₹{historyAccount.totalPaid.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Remaining Due
                  </span>
                  <div style={{ fontWeight: 700, color: 'var(--color-warning)' }}>
                    ₹{historyAccount.remainingBalance.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase' }}>
                Issued Official Receipts ({historyAccount.payments.length})
              </h4>

              {historyAccount.payments.length === 0 ? (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  No payment receipts issued yet for this account.
                </p>
              ) : (
                <div className={styles.paymentsList}>
                  {historyAccount.payments.map((p) => (
                    <div key={p.id} className={styles.paymentItem}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: 'var(--text-sm)' }}>
                            {p.receiptNumber}
                          </strong>
                          <span
                            className={p.paymentMode === 'Cash' ? styles.badgeCash : styles.badgeUpi}
                          >
                            {p.paymentMode}
                          </span>
                        </div>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
                          {new Date(p.paymentDate).toLocaleDateString('en-IN')} • Received by{' '}
                          {p.createdBy}
                        </span>
                        {p.notes && (
                          <span style={{ display: 'block', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                            Notes: {p.notes}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-success)' }}>
                          ₹{p.amountPaid.toLocaleString('en-IN')}
                        </strong>

                        {canPrint && (
                          <button
                            type="button"
                            className={styles.actionBtnSuccess}
                            onClick={() => void handlePrintReceipt(p.receiptNumber)}
                            disabled={printingReceiptNum === p.receiptNumber}
                            title="Print Official Rent Receipt"
                          >
                            <Printer size={13} aria-hidden="true" />
                            Print
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setHistoryAccount(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
