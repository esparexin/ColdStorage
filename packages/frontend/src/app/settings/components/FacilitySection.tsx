'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Pencil, Plus } from 'lucide-react';
import type { Facility } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { Badge, Button, DataTable, type DataTableColumn } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import pageStyles from '../page.module.css';
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

  const fetchFacilities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestWithAuth('/api/facilities');
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(row)}
          leftIcon={<Pencil size={13} aria-hidden="true" />}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className={pageStyles.sectionCard}>
      <div className={pageStyles.sectionHeader}>
        <Building2 size={18} color="var(--color-primary)" aria-hidden="true" />
        <h2 className={pageStyles.sectionTitle}>Facilities</h2>
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
          }}
        />
      )}
    </div>
  );
}
