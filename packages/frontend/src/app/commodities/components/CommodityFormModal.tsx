'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface CommodityFormModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CommodityFormModal({ onClose, onSuccess }: CommodityFormModalProps) {
  const [formName, setFormName] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

      onSuccess();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2 id="modal-title" className={styles.modalTitle}>
            Register New Commodity
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
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

          <Input
            id="commodity-name"
            label="Commodity Name"
            type="text"
            required
            maxLength={100}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Potato (Kufri Jyoti), Apples, Garlic"
            disabled={submitting}
          />

          <div className={styles.fieldGroup} style={{ marginTop: 'var(--space-3)' }}>
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
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              id="save-commodity-btn"
              type="submit"
              variant="primary"
              isLoading={submitting}
            >
              Register Commodity
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
