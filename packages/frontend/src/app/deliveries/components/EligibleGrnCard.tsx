'use client';

import React from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Badge, Button, Card } from '@/components/ui';
import styles from './EligibleGrnCard.module.css';

interface EligibleGrnCardProps {
  grn: Grn;
  onSelect: (grnId: string) => void;
  isSelected?: boolean;
}

export function formatGrnDate(dateVal?: string | Date | null): string {
  if (!dateVal) return '—';
  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function EligibleGrnCard({
  grn,
  onSelect,
  isSelected = false,
}: EligibleGrnCardProps) {
  const isLoanHold = grn.loanStatus === 'TAKEN';
  const availableBags = grn.closingBags ?? grn.bags;
  const inwardDate = formatGrnDate(grn.date);

  return (
    <Card className={`${styles.card} ${isSelected ? styles.selected : ''}`}>
      <div className={styles.header}>
        <div className={styles.idGroup}>
          <strong className={styles.grnNumber}>GRN #{grn.grnNumber}</strong>
          <span className={styles.inwardDate}>Inward: {inwardDate}</span>
        </div>
        <div className={styles.badges}>
          <Badge variant="neutral">{grn.rentType}</Badge>
          {isLoanHold && (
            <Badge variant="danger" icon={<span aria-hidden="true">🔒</span>}>
              Loan Hold
            </Badge>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.row}>
          <span className={styles.customerName}>{grn.customerName}</span>
          <span className={styles.commodityChamber}>
            {grn.commodityName} • Ch {grn.chamber}
          </span>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            Mark: <strong>{grn.storageMark || grn.partyMark || grn.grnNumber}</strong>
          </span>
          <span className={styles.metaItem}>
            Available: <strong>{availableBags.toLocaleString('en-IN')}</strong> bags
          </span>
        </div>
      </div>

      <div className={styles.footer}>
        <Button
          id={`outward-grn-select-${grn.id}`}
          type="button"
          variant={isLoanHold ? 'danger' : 'primary'}
          size="sm"
          disabled={isLoanHold}
          onClick={() => onSelect(grn.id)}
          aria-label={`Issue outward delivery for GRN ${grn.grnNumber}`}
        >
          {isLoanHold ? 'Loan Hold' : 'Outward →'}
        </Button>
      </div>
    </Card>
  );
}
