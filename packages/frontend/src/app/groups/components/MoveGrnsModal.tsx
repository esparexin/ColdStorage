'use client';

import React, { useState } from 'react';
import type { Group } from '@cold-storage/contracts';
import { Banner, Button, Modal, Select } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface MoveGrnsModalProps {
  selectedFacilityId: string;
  sourceGroup: Group;
  grnIds: string[];
  availableGroups: Group[];
  onClose: () => void;
  onSuccess: () => void;
}

export function MoveGrnsModal({
  selectedFacilityId,
  sourceGroup,
  grnIds,
  availableGroups,
  onClose,
  onSuccess,
}: MoveGrnsModalProps) {
  const [targetGroupId, setTargetGroupId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligibleTargets = availableGroups.filter((g) => g.id !== sourceGroup.id);

  const options = [
    { value: '', label: 'Select Target Group…' },
    ...eligibleTargets.map((g) => ({
      value: g.id,
      label: `${g.name} (${g.grnCount} GRNs)`,
    })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetGroupId) {
      setError('Please select a target group');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/groups/${encodeURIComponent(sourceGroup.id)}/move`;
      const res = await requestWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetGroupId,
          grnIds,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to move GRNs');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Move GRNs to Another Group" size="md">
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        {error && <Banner message={error} />}

        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
          Transferring <strong>{grnIds.length}</strong> {grnIds.length === 1 ? 'GRN' : 'GRNs'} from group{' '}
          <strong>{sourceGroup.name}</strong> to:
        </p>

        <div className={styles.fieldGroup}>
          <Select
            id="move-grns-target-group"
            label="Target Group *"
            value={targetGroupId}
            onChange={(e) => setTargetGroupId(e.target.value)}
          >
            <option value="">Select Target Group…</option>
            {eligibleTargets.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.grnCount} GRNs)
              </option>
            ))}
          </Select>
        </div>

        <div className={styles.modalFooter}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            id="submit-move-grns-btn"
            type="submit"
            variant="primary"
            isLoading={submitting}
            disabled={!targetGroupId}
          >
            Move GRNs
          </Button>
        </div>
      </form>
    </Modal>
  );
}
