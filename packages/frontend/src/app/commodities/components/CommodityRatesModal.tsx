'use client';

import React, { useEffect, useState } from 'react';
import type { Commodity } from '@cold-storage/contracts';
import { Button, FeedbackStates, Input, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { useCommodityRates } from '../hooks/useCommodityRates';
import {
  buildRatePayloads,
  EMPTY_RATES_FORM,
  hydrateRatesForm,
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

interface RateField {
  key: keyof CommodityRatesFormState;
  id: string;
  label: string;
}

interface RateSection {
  title: string;
  subtitle: string;
  fields: [RateField, RateField];
}

const SECTIONS: RateSection[] = [
  {
    title: 'Seasonal — March to December',
    subtitle: 'Whole-season total per bag (10 months informational)',
    fields: [
      { key: 'seasonalSmall', id: 'rate-seasonal-small', label: 'Small-Bag Rate (whole-season total ₹/bag)' },
      { key: 'seasonalBig', id: 'rate-seasonal-big', label: 'Big-Bag Rate (whole-season total ₹/bag)' },
    ],
  },
  {
    title: 'Monthly — January and February',
    subtitle: 'Rent per bag for one month',
    fields: [
      { key: 'monthlySmall', id: 'rate-monthly-small', label: 'Small-Bag Rate (₹/bag/month)' },
      { key: 'monthlyBig', id: 'rate-monthly-big', label: 'Big-Bag Rate (₹/bag/month)' },
    ],
  },
];

export function CommodityRatesModal({ commodity, onClose, onSaved }: CommodityRatesModalProps) {
  const { rates, loading, error, retry, saving, saveRates } = useCommodityRates(commodity.id);
  const [form, setForm] = useState<CommodityRatesFormState>(EMPTY_RATES_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [modalError, setModalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Fresh state per commodity so switching rows never shows stale values.
  useEffect(() => {
    setForm(EMPTY_RATES_FORM);
    setFieldErrors({});
    setModalError(null);
    setSaved(false);
  }, [commodity.id]);

  useEffect(() => {
    if (loading) return;
    const hydrated = hydrateRatesForm(rates);
    if (hydrated) setForm(hydrated);
  }, [rates, loading]);

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
      setSaved(true);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to save rates');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Price Controller Rates: ${commodity.name}`} size="md">
      {loading ? (
        <FeedbackStates.Loading label="Loading rates…" />
      ) : error ? (
        <FeedbackStates.Error title="Failed to load rates" message={error} onRetry={retry} />
      ) : saved ? (
        <div className={styles.modalForm}>
          <Banner
            variant="success"
            id="rates-saved-confirmation"
            message={`Rates saved for ${commodity.name}. Saving updates the commodity's complete four-rate configuration; existing GRNs keep their agreed rates.`}
          />
          <div className={styles.modalFooter}>
            <Button variant="primary" onClick={onSaved}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {modalError && <Banner message={modalError} id="rates-modal-error" />}
          {SECTIONS.map((section) => (
            <section key={section.title} className={styles.rateSection} aria-label={section.title}>
              <h3 className={styles.rateSectionTitle}>{section.title}</h3>
              <p className={styles.formHint}>{section.subtitle}</p>
              <div className={styles.rateGrid}>
                {section.fields.map((field) => (
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
              </div>
            </section>
          ))}
          <p className={styles.formHint}>
            Saving updates the commodity&apos;s complete four-rate configuration at once.
            Existing GRNs keep their agreed rates.
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
