import React from 'react';
import { Info } from 'lucide-react';
import { CANONICAL_BAG_RATES, type RentType } from '@cold-storage/contracts';
import styles from './RentRateReferenceNote.module.css';

interface RentRateReferenceNoteProps {
  rentType: RentType;
  commodityName?: string;
}

export function RentRateReferenceNote({ rentType, commodityName }: RentRateReferenceNoteProps) {
  const rates = CANONICAL_BAG_RATES[rentType];
  const isSeasonal = rentType === 'Seasonal';

  return (
    <div className={styles.noteCard} role="status" aria-label="Rate Reference Note">
      <div className={styles.headerRow}>
        <Info size={14} className={styles.icon} aria-hidden="true" />
        <span className={styles.title}>
          Rate Reference (Informational){commodityName ? ` · ${commodityName}` : ''}
        </span>
        <span className={styles.badge}>{rentType}</span>
      </div>
      <div className={styles.ratesRow}>
        <span>
          Small Bags: <strong>₹{rates.small}/bag{isSeasonal ? ' (10m)' : '/mo'}</strong>
        </span>
        <span className={styles.divider}>•</span>
        <span>
          Big Bags: <strong>₹{rates.big}/bag{isSeasonal ? ' (10m)' : '/mo'}</strong>
        </span>
      </div>
      <p className={styles.disclaimer}>
        * Informational only. Storage arrangement is recorded at Inward; actual rent calculation occurs at Outward delivery.
      </p>
    </div>
  );
}
