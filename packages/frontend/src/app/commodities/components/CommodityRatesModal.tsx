'use client';

import React, { useEffect, useState } from 'react';
import type { Commodity } from '@cold-storage/contracts';
import { Button, FeedbackStates, Input, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { useCommodityRates } from '../hooks/useCommodityRates';
import {
  buildRatePayloads,
  EMPTY_RATES_FORM,
  parseRateInput,
  validateRatesForm,
  type CommodityRatesFormState,
} from './commodityRates.helper';
import styles from '../page.module.css';

interface CommodityRatesModalProps {
  commodity: Commodity;
  onClose: () => void;
  onSaved: () => void;
}

const FIELD_IDS: Array<{ key: keyof CommodityRatesFormState; id: string; label: string }> = [
  { key: 'seasonalSmall', id: 'rate-seasonal-small', label: 'Seasonal Small-Bag Rate (whole-season total ₹/bag)' },
  { key: 'seasonalBig', id: 'rate-seasonal-big', label: 'Seasonal Big-Bag Rate (whole-season total ₹/bag)' },
  { key: 'monthlySmall', id: 'rate-monthly-small', label: 'Monthly Small-Bag Rate (₹/bag/month)' },
  { key: 'monthlyBig', id: 'rate-monthly-big', label: 'Monthly Big-Bag Rate (₹/bag/month)' },
];

export function CommodityRatesModal({ commodity, onClose, onSaved }: CommodityRatesModalProps) {
  const { rates, loading, error, retry, saving, saveRates } = useCommodityRates(commodity.id);
  const [form, setForm] = useState<CommodityRatesFormState>(EMPTY_RATES_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [modalError, setModalError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || loading || rates.length === 0) return;
    const byType = new Map(rates.map((r) => [r.rentType, r]));
    setForm({
      seasonalSmall: byType.get('Seasonal')?.smallRate ?? '',
      seasonalBig: byType.get('Seasonal')?.bigRate ?? '',
      monthlySmall: byType.get('Monthly')?.smallRate ?? '',
      monthlyBig: byType.get('Monthly')?.bigRate ?? '',
    });
    setHydrated(true);
  }, [rates, loading, hydrated]);

  const setField = (key: keyof CommodityRatesFormState, raw: string) => {
    setForm((prev) => ({ ...prev, [key]: parseRateInput(raw) }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    const errors = validateRatesForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setModalError(errors[Object.keys(errors)[0]]);
      return;
    }
    try {
      await saveRates(buildRatePayloads(form));
      onSaved();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to save rates');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Price Controller Rates: ${commodity.name}`} size="sm">
      {loading ? (
        <FeedbackStates.Loading label="Loading rates…" />
      ) : error ? (
        <FeedbackStates.Error title="Failed to load rates" message={error} onRetry={retry} />
      ) : (
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {modalError && <Banner message={modalError} id="rates-modal-error" />}
          {FIELD_IDS.map((field) => (
            <Input
              key={field.id}
              id={field.id}
              label={field.label}
              type="text"
              inputMode="decimal"
              required
              value={form[field.key]}
              onChange={(e) => setField(field.key, e.target.value)}
              placeholder="e.g. 12"
              disabled={saving}
              error={fieldErrors[field.key]}
            />
          ))}
          <p className={styles.formHint}>
            Seasonal rates are whole-season totals per bag; monthly rates are per bag per month.
            Saving overwrites both subscription types together. Existing GRNs keep their agreed rates.
          </p>
          <div className={styles.modalFooter}>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button id="save-rates-btn" type="submit" variant="primary" isLoading={saving}>
              Save Rates
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
