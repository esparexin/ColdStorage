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

interface MatrixRow {
  title: string;
  subtitle: string;
  smallKey: 'seasonalSmall' | 'monthlySmall';
  smallId: string;
  smallAriaLabel: string;
  bigKey: 'seasonalBig' | 'monthlyBig';
  bigId: string;
  bigAriaLabel: string;
}

const MATRIX_ROWS: MatrixRow[] = [
  {
    title: 'Seasonal Subscription',
    subtitle: 'March–December (₹/bag)',
    smallKey: 'seasonalSmall',
    smallId: 'rate-seasonal-small',
    smallAriaLabel: 'Seasonal Small-Bag Rate (₹/bag)',
    bigKey: 'seasonalBig',
    bigId: 'rate-seasonal-big',
    bigAriaLabel: 'Seasonal Big-Bag Rate (₹/bag)',
  },
  {
    title: 'Monthly Subscription',
    subtitle: 'Per month (₹/bag/month)',
    smallKey: 'monthlySmall',
    smallId: 'rate-monthly-small',
    smallAriaLabel: 'Monthly Small-Bag Rate (₹/bag/month)',
    bigKey: 'monthlyBig',
    bigId: 'rate-monthly-big',
    bigAriaLabel: 'Monthly Big-Bag Rate (₹/bag/month)',
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
            message={`Rates saved for ${commodity.name}.`}
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
          <div className={styles.matrixContainer}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>
                  <th scope="col" className={styles.matrixTh}>Subscription</th>
                  <th scope="col" className={styles.matrixTh} style={{ textAlign: 'center' }}>
                    Small Bag
                  </th>
                  <th scope="col" className={styles.matrixTh} style={{ textAlign: 'center' }}>
                    Big Bag
                  </th>
                </tr>
              </thead>
              <tbody>
                {MATRIX_ROWS.map((row) => (
                  <tr key={row.title} className={styles.matrixTr}>
                    <td className={styles.matrixTd}>
                      <div className={styles.matrixRowTitle}>{row.title}</div>
                      <div className={styles.matrixRowSubtitle}>{row.subtitle}</div>
                    </td>
                    <td className={styles.matrixTd}>
                      <Input
                        id={row.smallId}
                        aria-label={row.smallAriaLabel}
                        type="text"
                        inputMode="decimal"
                        required
                        value={form[row.smallKey]}
                        onChange={(e) => setField(row.smallKey, e.target.value)}
                        placeholder="e.g. 10"
                        disabled={saving}
                        error={fieldErrors[row.smallKey]}
                      />
                    </td>
                    <td className={styles.matrixTd}>
                      <Input
                        id={row.bigId}
                        aria-label={row.bigAriaLabel}
                        type="text"
                        inputMode="decimal"
                        required
                        value={form[row.bigKey]}
                        onChange={(e) => setField(row.bigKey, e.target.value)}
                        placeholder="e.g. 12"
                        disabled={saving}
                        error={fieldErrors[row.bigKey]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
