'use client';

import React, { useState } from 'react';
import type { Group } from '@cold-storage/contracts';
import { Banner, Button, Modal } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface RenameGroupModalProps {
  selectedFacilityId: string;
  group: Group;
  onClose: () => void;
  onSuccess: () => void;
}

export function RenameGroupModal({
  selectedFacilityId,
  group,
  onClose,
  onSuccess,
}: RenameGroupModalProps) {
  const [name, setName] = useState(group.name);
  const [remarks, setRemarks] = useState(group.remarks || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Group name is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/groups/${encodeURIComponent(group.id)}`;
      const res = await requestWithAuth(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          remarks: remarks.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update group');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit / Rename Group" size="md">
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        {error && <Banner message={error} />}

        <div className={styles.fieldGroup}>
          <label htmlFor="rename-group-name" className={styles.fieldLabel}>
            Group / Trader Name *
          </label>
          <input
            id="rename-group-name"
            type="text"
            className={styles.fieldInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            required
            autoFocus
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="rename-group-remarks" className={styles.fieldLabel}>
            Remarks (Optional)
          </label>
          <textarea
            id="rename-group-remarks"
            className={styles.fieldTextarea}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className={styles.modalFooter}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button id="submit-rename-group-btn" type="submit" variant="primary" isLoading={submitting}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
