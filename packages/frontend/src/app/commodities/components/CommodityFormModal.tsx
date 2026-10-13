'use client';

import React, { useState } from 'react';
import type { SeasonDuration } from '@cold-storage/contracts';
import { Button, Input, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface CommodityFormModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CommodityFormModal({ onClose, onSuccess }: CommodityFormModalProps) {
  const [formName, setFormName] = useState('');
  const [seasonDuration, setSeasonDuration] = useState<SeasonDuration>('Seasonal');
  const [hamaliRate, setHamaliRate] = useState<string>('0');
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

    const parsedHamali = parseFloat(hamaliRate);
    if (isNaN(parsedHamali) || parsedHamali < 0) {
      setModalError('Hamali rate must be a non-negative number');
      return;
    }

    setSubmitting(true);
    try {
      const res = await requestWithAuth('/api/commodities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          seasonDuration,
          hamaliRate: parsedHamali,
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
    <Modal
      isOpen
      onClose={onClose}
      title="Register New Commodity"
      size="sm"
    >
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        {modalError && <Banner message={modalError} id="commodity-modal-error" />}

        <Input
          id="commodity-name"
          label="Commodity Name"
          type="text"
          required
          maxLength={100}
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g. Potato, Apples"
          disabled={submitting}
          error={modalError}
        />

        <div className={styles.rateSection}>
          <label className={styles.rateSectionTitle}>Storage Duration (Select One) *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
            <label className={styles.checkboxLabel}>
              <input
                type="radio"
                name="seasonDuration"
                value="Seasonal"
                checked={seasonDuration === 'Seasonal'}
                onChange={() => setSeasonDuration('Seasonal')}
                disabled={submitting}
              />
              <span>Seasonal — 10 Months</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="radio"
                name="seasonDuration"
                value="Seasonal_3M"
                checked={seasonDuration === 'Seasonal_3M'}
                onChange={() => setSeasonDuration('Seasonal_3M')}
                disabled={submitting}
              />
              <span>Seasonal — 3 Months</span>
            </label>
          </div>
        </div>

        <Input
          id="commodity-hamali-rate"
          label="Hamali Rate (₹ / bag)"
          type="number"
          min="0"
          step="0.5"
          value={hamaliRate}
          onChange={(e) => setHamaliRate(e.target.value)}
          placeholder="0.00"
          disabled={submitting}
        />

        <div className={styles.checkboxGroup}>
          <label htmlFor="commodity-is-active" className={styles.checkboxLabel}>
            <input
              id="commodity-is-active"
              type="checkbox"
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
              disabled={submitting}
            />
            <span>Active &amp; Acceptable for Inward</span>
          </label>
        </div>

        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button id="save-commodity-btn" type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Register Commodity'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
