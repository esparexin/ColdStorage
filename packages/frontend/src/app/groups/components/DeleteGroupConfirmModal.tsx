'use client';

import React, { useState } from 'react';
import type { Group } from '@cold-storage/contracts';
import { Banner, ConfirmDialog } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';

interface DeleteGroupConfirmModalProps {
  selectedFacilityId: string;
  group: Group;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteGroupConfirmModal({
  selectedFacilityId,
  group,
  onClose,
  onSuccess,
}: DeleteGroupConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMembers = group.grnCount > 0;

  const handleConfirm = async () => {
    if (hasMembers) {
      setError('Cannot delete group while it contains assigned GRNs. Please unassign or move them first.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/groups/${encodeURIComponent(group.id)}`;
      const res = await requestWithAuth(url, { method: 'DELETE' });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete group');
    } finally {
      setSubmitting(false);
    }
  };

  const message = hasMembers
    ? `Group "${group.name}" currently contains ${group.grnCount} assigned GRN(s). The safe deletion rule requires that all member GRNs be unassigned or moved before deletion.`
    : `Are you sure you want to delete the empty group "${group.name}"? This action cannot be undone.`;

  return (
    <>
      {error && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999 }}>
          <Banner message={error} />
        </div>
      )}
      <ConfirmDialog
        isOpen
        title="Delete Group"
        message={message}
        confirmLabel={hasMembers ? 'Blocked' : 'Delete Group'}
        isBusy={submitting}
        onConfirm={hasMembers ? onClose : () => void handleConfirm()}
        onCancel={onClose}
      />
    </>
  );
}
