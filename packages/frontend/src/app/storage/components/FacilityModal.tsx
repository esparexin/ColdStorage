'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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

  if (!isOpen) return null;

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
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3>{mode === 'edit' ? 'Edit Warehouse Facility' : 'Add New Warehouse Facility'}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className={styles.bannerError} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="facilityCode">Facility Code *</label>
            <input
              id="facilityCode"
              type="text"
              required
              placeholder="e.g. F1, CENTRAL, NORTH"
              className={styles.inputField}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="facilityName">Facility Name *</label>
            <input
              id="facilityName"
              type="text"
              required
              placeholder="e.g. Nashik Cold Storage Hub 1"
              className={styles.inputField}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
