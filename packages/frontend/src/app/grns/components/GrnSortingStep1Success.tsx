'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { SortGrnResult } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import styles from './GrnSortingModal.module.css';

interface GrnSortingStep1SuccessProps {
  sortingResult: SortGrnResult;
  onProceedToRepack: () => void;
}

export function GrnSortingStep1Success({ sortingResult, onProceedToRepack }: GrnSortingStep1SuccessProps) {
  return (
    <div className={styles.billSuccessNotice}>
      <div className={styles.billTitle}>
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>Sorting Confirmed &amp; Rent Obligation Settled</span>
      </div>
      <div className={styles.billDetailRow}>
        <span>Receipt Number:</span>
        <strong>{sortingResult.receiptNumber || 'N/A (Zero dues)'}</strong>
      </div>
      <div className={styles.billDetailRow}>
        <span>Billed Amount:</span>
        <strong>₹{sortingResult.billedAmount.toFixed(2)}</strong>
      </div>
      <div style={{ marginTop: 'var(--space-2)', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          id="proceed-to-repack-btn"
          variant="primary"
          size="sm"
          onClick={onProceedToRepack}
        >
          Continue to Repacking/Rebagging →
        </Button>
      </div>
    </div>
  );
}

