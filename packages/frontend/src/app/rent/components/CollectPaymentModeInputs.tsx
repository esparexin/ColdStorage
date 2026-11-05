'use client';

import React from 'react';
import { CreditCard, Wallet } from 'lucide-react';
import type { PaymentMode } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import styles from '../page.module.css';

interface CollectPaymentModeInputsProps {
  collectMode: PaymentMode;
  setCollectMode: (mode: PaymentMode) => void;
  collectDate: string;
  setCollectDate: (date: string) => void;
  upiReference: string;
  setUpiReference: (ref: string) => void;
  collectNotes: string;
  setCollectNotes: (notes: string) => void;
}

export function CollectPaymentModeInputs({
  collectMode,
  setCollectMode,
  collectDate,
  setCollectDate,
  upiReference,
  setUpiReference,
  collectNotes,
  setCollectNotes,
}: CollectPaymentModeInputsProps) {
  return (
    <>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel} id="payment-mode-label">
          Payment Mode *
        </span>
        <div
          className={styles.modeToggleGroup}
          role="radiogroup"
          aria-labelledby="payment-mode-label"
        >
          <Button
            type="button"
            role="radio"
            aria-checked={collectMode === 'Cash'}
            variant={collectMode === 'Cash' ? 'primary' : 'outline'}
            className={`${styles.modeOption} ${collectMode === 'Cash' ? styles.modeOptionActive : ''}`}
            onClick={() => setCollectMode('Cash')}
            leftIcon={<Wallet size={16} aria-hidden="true" />}
          >
            Cash
          </Button>
          <Button
            type="button"
            role="radio"
            aria-checked={collectMode === 'UPI'}
            variant={collectMode === 'UPI' ? 'primary' : 'outline'}
            className={`${styles.modeOption} ${collectMode === 'UPI' ? styles.modeOptionActive : ''}`}
            onClick={() => setCollectMode('UPI')}
            leftIcon={<CreditCard size={16} aria-hidden="true" />}
          >
            UPI
          </Button>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="collect-date" className={styles.fieldLabel}>
          Payment Date *
        </label>
        <input
          id="collect-date"
          type="date"
          required
          className={styles.fieldInput}
          value={collectDate}
          onChange={(e) => setCollectDate(e.target.value)}
        />
      </div>

      {collectMode === 'UPI' && (
        <div className={styles.fieldGroup}>
          <label htmlFor="collect-upi-ref" className={styles.fieldLabel}>
            UPI Transaction ID / Reference *
          </label>
          <input
            id="collect-upi-ref"
            type="text"
            required
            maxLength={100}
            className={styles.fieldInput}
            placeholder="e.g. UPI1234567890 or Bank Ref"
            value={upiReference}
            onChange={(e) => setUpiReference(e.target.value)}
          />
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label htmlFor="collect-notes" className={styles.fieldLabel}>
          Payment Notes (Optional)
        </label>
        <input
          id="collect-notes"
          type="text"
          maxLength={400}
          className={styles.fieldInput}
          placeholder="Optional notes"
          value={collectNotes}
          onChange={(e) => setCollectNotes(e.target.value)}
        />
      </div>
    </>
  );
}

