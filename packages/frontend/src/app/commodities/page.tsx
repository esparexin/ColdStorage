'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Search, X, XCircle } from 'lucide-react';
import { can, type Commodity, type Role } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

export default function CommoditiesPage() {
  const { user } = useAuth();
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManage = can(userRole, 'commodity:manage');

  const fetchCommodities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestWithAuth('/api/commodities');
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: Commodity[] };
      setCommodities(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load commodities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCommodities();
  }, [fetchCommodities]);

  const filteredCommodities = useMemo(() => {
    if (!searchTerm.trim()) return commodities;
    const term = searchTerm.toLowerCase();
    return commodities.filter((c) => c.name.toLowerCase().includes(term));
  }, [commodities, searchTerm]);

  const openCreateModal = () => {
    setFormName('');
    setFormIsActive(true);
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setModalError('Commodity name is required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await requestWithAuth('/api/commodities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          isActive: formIsActive,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to register commodity');
      }

      closeModal();
      await fetchCommodities();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (commodity: Commodity) => {
    try {
      const res = await requestWithAuth(`/api/commodities/${commodity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: !commodity.isActive,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to update commodity status');
      }

      await fetchCommodities();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const columns: DataTableColumn<Commodity>[] = [
    {
      key: 'name',
      header: 'Commodity Name',
      render: (row) => <strong>{row.name}</strong>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className={row.isActive ? styles.statusActive : styles.statusInactive}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (row: Commodity) => (
              <button
                type="button"
                className={styles.toggleBtn}
                onClick={() => void handleToggleActive(row)}
                title={row.isActive ? 'Deactivate commodity' : 'Activate commodity'}
              >
                {row.isActive ? (
                  <>
                    <XCircle size={13} aria-hidden="true" color="var(--color-danger)" />
                    <span>Deactivate</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} aria-hidden="true" color="var(--color-success)" />
                    <span>Activate</span>
                  </>
                )}
              </button>
            ),
            align: 'right' as const,
          },
        ]
      : []),
  ];

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Commodities</h1>
          <p className={styles.pageSub}>Master catalog of acceptable agricultural and perishable goods</p>
        </div>
        {canManage && (
          <button
            id="add-commodity-btn"
            type="button"
            className={styles.primaryBtn}
            onClick={openCreateModal}
          >
            <Plus size={16} aria-hidden="true" />
            <span>Add Commodity</span>
          </button>
        )}
      </div>

      <div className={styles.searchBar}>
        <Search size={16} aria-hidden="true" color="var(--color-text-muted)" />
        <input
          type="search"
          placeholder="Search by commodity name…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
          aria-label="Search commodities"
        />
      </div>

      {loading ? (
        <FeedbackStates.Loading label="Loading commodities…" />
      ) : error ? (
        <FeedbackStates.Error message={error} onRetry={() => void fetchCommodities()} />
      ) : commodities.length === 0 ? (
        <FeedbackStates.Empty
          message="No commodities registered yet."
          action={
            canManage
              ? {
                  id: 'empty-add-commodity-btn',
                  label: '+ Add Commodity',
                  onClick: openCreateModal,
                }
              : undefined
          }
        />
      ) : filteredCommodities.length === 0 ? (
        <FeedbackStates.Empty message={`No commodities matching "${searchTerm}".`} />
      ) : (
        <DataTable
          columns={columns}
          rows={filteredCommodities}
          rowKey={(row) => row.id}
          caption="Commodity catalog"
        />
      )}

      {/* Accessible Commodity Modal */}
      {isModalOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 id="modal-title" className={styles.modalTitle}>
                Register New Commodity
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeModal}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.modalForm}>
              {modalError && (
                <div className={styles.modalError} role="alert">
                  {modalError}
                </div>
              )}

              <div className={styles.fieldGroup}>
                <label htmlFor="commodity-name" className={styles.fieldLabel}>
                  Commodity Name *
                </label>
                <input
                  id="commodity-name"
                  type="text"
                  required
                  maxLength={100}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Potato (Kufri Jyoti), Apples, Garlic"
                  className={styles.fieldInput}
                  disabled={submitting}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    disabled={submitting}
                  />
                  <span>Active & Acceptable for Inward</span>
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  id="save-commodity-btn"
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submitting}
                >
                  {submitting ? 'Saving…' : 'Register Commodity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
