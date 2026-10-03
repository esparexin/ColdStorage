'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Modal } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface FacilityModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  facilityId?: string | null;
  initialCode?: string;
  initialName?: string;
  onClose: () => void;
  onSuccess: (message: string, newFacilityId?: string) => void;
}

export function FacilityModal({
  isOpen,
  mode,
  facilityId,
  initialCode = '',
  initialName = '',
  onClose,
  onSuccess,
}: FacilityModalProps) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCode(initialCode);
      setName(initialName);
      setError(null);
    }
  }, [isOpen, initialCode, initialName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Facility code and name are required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const url = mode === 'edit' && facilityId ? `/api/facilities/${facilityId}` : '/api/facilities';
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const res = await requestWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to save facility');
      }

      const data = (await res.json()) as { facility?: { id: string } };
      onSuccess(
        `Facility "${name.trim()}" ${mode === 'edit' ? 'updated' : 'created'} successfully.`,
        data.facility?.id,
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit Warehouse Facility' : 'Add New Warehouse Facility'}
      size="sm"
    >
      {error && (
        <div className={styles.bannerError} role="alert" style={{ marginBottom: 'var(--space-3)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Input
          id="facilityCode"
          label="Facility Code"
          required
          placeholder="e.g. F1, CENTRAL, NORTH"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          disabled={submitting}
        />

        <Input
          id="facilityName"
          label="Facility Name"
          required
          placeholder="e.g. Nashik Cold Storage Hub 1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />

        <div className={styles.modalActions}>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting} isLoading={submitting}>
            {mode === 'edit' ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
