'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import {
  deriveBagPrice,
  SEASONAL_RENT_MONTHS,
  type Grn,
} from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import styles from './RentTermsCell.module.css';

interface RentTermsCellProps {
  row: Grn;
}

function getElapsedDuration(
  startDate: Date | string,
  asOfDate: Date = new Date(),
): { days: number; text: string } {
  const start = new Date(startDate);
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const asOfMidnight = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());

  const diffMs = asOfMidnight.getTime() - startMidnight.getTime();
  const days = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

  if (days === 0) return { days: 0, text: '< 1 day' };
  if (days === 1) return { days: 1, text: '1 day' };
  if (days < 30) return { days, text: `${days} days` };

  const months = Math.floor(days / 30);
  const remainingDays = days % 30;
  if (remainingDays === 0) {
    return { days, text: `${months} ${months === 1 ? 'month' : 'months'}` };
  }
  return {
    days,
    text: `${months} ${months === 1 ? 'month' : 'months'} ${remainingDays} ${remainingDays === 1 ? 'day' : 'days'}`,
  };
}

export function RentTermsCell({ row }: RentTermsCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const asOfDate = new Date();

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const termMonths =
    row.rentType === 'Seasonal' ? SEASONAL_RENT_MONTHS : Math.max(1, row.rentMonths ?? 1);

  const effectiveRate =
    row.bagPrice ??
    deriveBagPrice({
      rentType: row.rentType,
      bags: row.bags,
      bagPrice: row.bagPrice,
      rentMonths: row.rentMonths,
      rentAmount: row.rentAmount,
    });

  const startDateFormatted = new Date(row.date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const asOfDateFormatted = asOfDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const elapsed = getElapsedDuration(row.date, asOfDate);

  const cycleNumber = Math.min(termMonths, Math.floor(elapsed.days / 30) + 1);
  const monthlyCycleCharge = Number(((effectiveRate ?? 0) * row.bags).toFixed(2));

  const contractTermText =
    row.rentType === 'Seasonal' ? '10 months' : `${row.rentMonths ?? 1} months`;

  return (
    <div
      className={styles.cellWrapper}
      ref={containerRef}
      onMouseLeave={() => setIsOpen(false)}
    >
      <span className={styles.termType}>
        {row.rentType}
        {row.rentType === 'Monthly' && row.rentMonths ? ` (${row.rentMonths}m)` : ''}
      </span>
      <div className={styles.amountRow}>
        <span className={styles.contractRent}>
          {row.rentAmount != null ? `₹${row.rentAmount.toLocaleString('en-IN')}` : 'Dynamic'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={styles.infoTrigger}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          onMouseEnter={() => setIsOpen(true)}
          aria-label={`Rent calculation breakdown for GRN ${row.grnNumber}`}
          aria-expanded={isOpen}
          title="View rent calculation breakdown"
          leftIcon={<Info size={12} aria-hidden="true" />}
        />
      </div>

      {isOpen && (
        <div className={styles.popover} role="dialog" aria-label="Rent calculation breakdown">
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>Rent Calculation</span>
            <Button
              variant="ghost"
              size="sm"
              className={styles.closeBtn}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              aria-label="Close calculation breakdown"
              leftIcon={<X size={13} aria-hidden="true" />}
            />
          </div>
          <div className={styles.divider} />
          <div className={styles.dataGrid}>
            <div className={styles.dataRow}>
              <span className={styles.label}>Calculation date:</span>
              <span className={styles.value}>{startDateFormatted}</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>As of date:</span>
              <span className={styles.value}>{asOfDateFormatted}</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Contract term:</span>
              <span className={styles.value}>{contractTermText}</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Elapsed period:</span>
              <span className={styles.value}>{elapsed.text}</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Bag quantity:</span>
              <span className={styles.value}>{row.bags.toLocaleString('en-IN')}</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Rate:</span>
              <span className={styles.value}>
                {effectiveRate != null
                  ? `₹${effectiveRate.toFixed(2)} / bag / month`
                  : '—'}
              </span>
            </div>
          </div>
          <div className={styles.divider} />
          <div className={styles.dataGrid}>
            <div className={styles.dataRow}>
              <span className={styles.label}>Original rent:</span>
              <span className={styles.valueEmphasized}>
                {row.rentAmount != null ? `₹${row.rentAmount.toLocaleString('en-IN')}` : 'Dynamic'}
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Current rent:</span>
              <span className={styles.value}>
                {row.rentType === 'Monthly'
                  ? `₹${monthlyCycleCharge.toLocaleString('en-IN')} / month (Cycle ${cycleNumber} in progress)`
                  : row.rentAmount != null
                  ? `₹${row.rentAmount.toLocaleString('en-IN')} (Fixed Season Term)`
                  : '—'}
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Remaining rent:</span>
              <span className={styles.value}>
                {row.rentAmount != null ? `₹${row.rentAmount.toLocaleString('en-IN')}` : 'Dynamic'}
              </span>
            </div>
          </div>
          {effectiveRate != null && (
            <>
              <div className={styles.divider} />
              <div className={styles.formulaNote}>
                {row.bags.toLocaleString('en-IN')} bags × ₹{effectiveRate.toFixed(2)}/bag/mo × {termMonths}m{row.rentAmount != null ? ` = ₹${row.rentAmount.toLocaleString('en-IN')}` : ''}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
