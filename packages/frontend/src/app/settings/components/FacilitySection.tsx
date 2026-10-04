'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Facility } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
} from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useFacility } from '@/context/FacilityContext';
import styles from './FacilitySection.module.css';
import { FacilityFormModal } from './FacilityFormModal';

/**
 * Facility is the tenancy and access-scope root. It carries no storage hierarchy: chambers are
 * free-text labels on each GRN. These records are maintained by SUPER_ADMIN only, so this
 * section is only reachable from Settings, which is already gated on `settings:manage`.
 */
export function FacilitySection() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<Facility | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { refreshFacilities } = useFacility();

  const fetchFacilities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestWithAuth('/api/facilities?includeInactive=true');
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: Facility[] };
      setFacilities(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load facilities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFacilities();
  }, [fetchFacilities]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    setActionError(null);
    try {
      const res = await requestWithAuth(`/api/facilities/${deleting.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Failed to delete facility (HTTP ${res.status})`);
      }
      setDeleting(null);
      await fetchFacilities();
      void refreshFacilities();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete facility');
    } finally {
      setDeletePending(false);
    }
  };

  const handleToggleActive = async (row: Facility) => {
    setTogglingId(row.id);
    setActionError(null);
    try {
      const res = await requestWithAuth(`/api/facilities/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Failed to update facility (HTTP ${res.status})`);
      }
      await fetchFacilities();
      void refreshFacilities();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to update facility');
    } finally {
      setTogglingId(null);
    }
  };

  const columns: DataTableColumn<Facility>[] = [
    { key: 'name', header: 'Facility', render: (row) => <strong>{row.name}</strong> },
    { key: 'code', header: 'Code', render: (row) => <code>{row.code}</code> },
    {
      key: 'address',
      header: 'Address',
      render: (row) => row.address || '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className={styles.rowActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(row)}
            leftIcon={<Pencil size={13} aria-hidden="true" />}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={togglingId === row.id}
            onClick={() => void handleToggleActive(row)}
          >
            {row.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!row.isActive}
            onClick={() => setDeleting(row)}
            leftIcon={<Trash2 size={13} aria-hidden="true" />}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Facilities</h2>
        <div style={{ marginLeft: 'auto' }}>
          <Button
            id="add-facility-btn"
            variant="outline"
            size="sm"
            onClick={() => setIsCreating(true)}
            leftIcon={<Plus size={14} aria-hidden="true" />}
          >
            Add Facility
          </Button>
        </div>
      </div>

      <p className={styles.sectionHint}>
        Facilities define tenant and access scope. Chambers are recorded as free text on each
        inward receipt, so there is no storage layout to configure here.
      </p>

      {loading ? (
        <FeedbackStates.Loading label="Loading facilities..." />
      ) : error ? (
        <FeedbackStates.Error title="Could not load facilities" message={error} onRetry={() => void fetchFacilities()} />
      ) : facilities.length === 0 ? (
        <FeedbackStates.Empty message="No facilities configured yet. Add one to begin recording inward receipts." />
      ) : (
        <DataTable
          columns={columns}
          rows={facilities}
          rowKey={(row) => row.id}
          caption="Configured facilities"
        />
      )}

      {actionError && (
        <FeedbackStates.Error title="Facility action failed" message={actionError} />
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete Facility"
        message={
          deleting
            ? `Delete facility "${deleting.name}" (${deleting.code})? A facility that still has inward receipts, inventory or rent payments cannot be deleted.`
            : ''
        }
        cancelLabel="Cancel"
        confirmLabel="Delete"
        isBusy={deletePending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />

      {(isCreating || editing) && (
        <FacilityFormModal
          facility={editing}
          onClose={() => {
            setIsCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setIsCreating(false);
            setEditing(null);
            void fetchFacilities();
            // Keep the app-wide facility selector in step so a newly created facility is
            // selectable without a full page reload.
            void refreshFacilities();
          }}
        />
      )}
    </div>
  );
}
