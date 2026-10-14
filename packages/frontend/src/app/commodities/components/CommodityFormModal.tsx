'use client';

import React, { useState } from 'react';
import type { Commodity, SeasonDuration } from '@cold-storage/contracts';
import { Button, Input, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { requestWithAuth } from '@/lib/api-client';
import { invalidateCache } from '@/lib/api-cache';
import styles from '../page.module.css';

interface CommodityFormModalProps {
  commodity?: Commodity | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function CommodityFormModal({ commodity, onClose, onSuccess }: CommodityFormModalProps) {
  const isEditing = Boolean(commodity);
  const [formName, setFormName] = useState(commodity?.name ?? '');
  const [seasonDuration, setSeasonDuration] = useState<SeasonDuration>(
    commodity?.seasonDuration ?? 'Seasonal',
  );
  const [isHamaliApplicable, setIsHamaliApplicable] = useState(
    commodity?.isHamaliApplicable ?? (commodity?.hamaliRate ? commodity.hamaliRate > 0 : false),
  );
  const [hamaliRate, setHamaliRate] = useState<string>(
    commodity?.hamaliRate != null && commodity.hamaliRate > 0 ? String(commodity.hamaliRate) : '0',
  );
  const [formIsActive, setFormIsActive] = useState(commodity?.isActive ?? true);
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

    let parsedHamali = 0;
    if (isHamaliApplicable) {
      parsedHamali = parseFloat(hamaliRate);
      if (isNaN(parsedHamali) || parsedHamali < 0) {
        setModalError('Hamali rate must be a non-negative number');
        return;
      }
    }

    setSubmitting(true);
    try {
      const url = isEditing && commodity ? `/api/commodities/${commodity.id}` : '/api/commodities';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await requestWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          seasonDuration,
          isHamaliApplicable,
          hamaliRate: parsedHamali,
          isActive: formIsActive,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to save commodity');
      }

      invalidateCache('/api/commodities');
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
      title={isEditing ? 'Edit Commodity' : 'Register New Commodity'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        {modalError && <Banner message={modalError} id="commodity-modal-error" />}

        <div className={styles.formGrid}>
          {/* Left Column: Commodity Name & Storage Duration */}
          <div className={styles.formColumn}>
            <Input
              id="commodity-name"
              label="Commodity Name"
              type="text"
              required
              maxLength={100}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Potato (Jyoti)"
              disabled={submitting}
              error={modalError}
            />

            <div className={styles.rateSection}>
              <label className={styles.rateSectionTitle}>Storage Duration (Select One) *</label>
              <p className={styles.formHint}>Select the applicable seasonal rent cycle</p>
              <div className={styles.radioGroup}>
                <label className={styles.radioCard} htmlFor="duration-seasonal-10m">
                  <input
                    id="duration-seasonal-10m"
                    type="radio"
                    name="seasonDuration"
                    value="Seasonal"
                    checked={seasonDuration === 'Seasonal'}
                    onChange={() => setSeasonDuration('Seasonal')}
                    disabled={submitting}
                  />
                  <div className={styles.radioContent}>
                    <span className={styles.radioTitle}>Seasonal — 10 Months</span>
                    <span className={styles.radioDesc}>Standard full seasonal cycle</span>
                  </div>
                </label>
                <label className={styles.radioCard} htmlFor="duration-seasonal-3m">
                  <input
                    id="duration-seasonal-3m"
                    type="radio"
                    name="seasonDuration"
                    value="Seasonal_3M"
                    checked={seasonDuration === 'Seasonal_3M'}
                    onChange={() => setSeasonDuration('Seasonal_3M')}
                    disabled={submitting}
                  />
                  <div className={styles.radioContent}>
                    <span className={styles.radioTitle}>Seasonal — 3 Months</span>
                    <span className={styles.radioDesc}>Short season / seed cycle</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Right Column: Independent Hamali & Status */}
          <div className={styles.formColumn}>
            <div className={styles.rateSection}>
              <label className={styles.rateSectionTitle}>Labor &amp; Handling</label>
              <p className={styles.formHint}>Upfront handling charge applied on Inward GRN</p>
              <div className={styles.sectionField}>
                <label htmlFor="commodity-hamali-applicable" className={styles.checkboxLabel}>
                  <input
                    id="commodity-hamali-applicable"
                    type="checkbox"
                    checked={isHamaliApplicable}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsHamaliApplicable(checked);
                      if (!checked) setHamaliRate('0');
                    }}
                    disabled={submitting}
                  />
                  <span>Hamali Applicable</span>
                </label>
              </div>
              <div className={styles.sectionField}>
                <Input
                  id="commodity-hamali-rate"
                  label="Hamali Rate (₹ / bag)"
                  type="number"
                  min="0"
                  step="0.5"
                  value={hamaliRate}
                  onChange={(e) => setHamaliRate(e.target.value)}
                  placeholder="0.00"
                  disabled={submitting || !isHamaliApplicable}
                  helperText={!isHamaliApplicable ? 'Check Hamali Applicable to configure rate' : undefined}
                />
              </div>
            </div>

            <div className={styles.rateSection}>
              <label className={styles.rateSectionTitle}>Status</label>
              <p className={styles.formHint}>Commodity availability for storage intake</p>
              <div className={styles.sectionField}>
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
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button id="save-commodity-btn" type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Register Commodity'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
