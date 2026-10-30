'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Package } from 'lucide-react';
import {
  seasonYearForInwardDate,
  type Commodity,
  type Grn,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import { Badge, Button } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import { MergeBagTypeFields } from './MergeBagTypeFields';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import { calculateMergeSourceRentSummary } from './mergeRentAssessment.helper';
import { resolveTransferRates } from './transferRentRates.helper';
import styles from './InternalMovementModal.module.css';

export interface MergeSourceGrnCardProps {
  source: Grn;
  confirmation: BagConfirmationValue;
  onConfirmationChange: (patch: Partial<BagConfirmationValue>) => void;
  movementDate: string;
  facilityId?: string;
  submitting: boolean;
  commodityHamaliRate: number;
  targetGrnDate?: Date | string | null;
  summary?: RentSummaryDto | null;
  commodity?: Pick<Commodity, 'rates'> | null;
}

export function MergeSourceGrnCard({
  source,
  confirmation,
  onConfirmationChange,
  movementDate,
  facilityId,
  submitting,
  commodityHamaliRate,
  targetGrnDate,
  summary: propSummary,
  commodity,
}: MergeSourceGrnCardProps) {
  const [isCardExpanded, setIsCardExpanded] = useState(true);
  const [isBagTypeExpanded, setIsBagTypeExpanded] = useState(true);
  const [fetchedSummary, setFetchedSummary] = useState<RentSummaryDto | null>(null);

  useEffect(() => {
    if (propSummary || !facilityId || !source.id) return;
    let isMounted = true;
    requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/rent/grn/${encodeURIComponent(source.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((dto: RentSummaryDto | null) => {
        if (isMounted && dto) setFetchedSummary(dto);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [facilityId, source.id, propSummary]);

  const summary = propSummary ?? fetchedSummary;
  const sourceBags = source.closingBags ?? source.bags;
  const { seasonalRates: rates } = useMemo(
    () => resolveTransferRates(source, commodity),
    [source, commodity],
  );

  const rentCalc = useMemo(
    () =>
      calculateMergeSourceRentSummary({
        source, confirmation, movementDate, commodityHamaliRate, targetGrnDate, summary, commodity,
      }),
    [source, confirmation, movementDate, commodityHamaliRate, targetGrnDate, summary, commodity],
  );

  return (
    <div className={styles.compactCard} id={`source-card-${source.id}`}>
      <div
        className={styles.cardHeader}
        style={{ cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap', gap: '8px' }}
        onClick={() => setIsCardExpanded((prev) => !prev)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={isCardExpanded ? `Collapse GRN #${source.grnNumber}` : `Expand GRN #${source.grnNumber}`}
            style={{
              padding: 0,
              minWidth: 'auto',
              height: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--color-text-secondary)',
            }}
          >
            {isCardExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </Button>
          <Package size={14} aria-hidden="true" />
          <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            GRN #{source.grnNumber}
          </span>
          {source.customerName && (
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 'normal' }}>
              — {source.customerName}
            </span>
          )}
        </div>

        {!isCardExpanded && (
          <div
            id={`source-grn-summary-${source.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            <Badge variant="neutral">{rentCalc.bagTypeLabel}</Badge>
            <Badge variant="neutral">{rentCalc.bagCountLabel}</Badge>
            <Badge variant={source.rentPaymentStatus === 'Settled' || (summary && summary.remainingBalance === 0) ? 'success' : 'warning'}>
              {source.rentPaymentStatus === 'Settled' || (summary && summary.remainingBalance === 0)
                ? 'Rent Settled'
                : `Rent Due: ₹${(summary?.remainingBalance ?? source.rentRemainingBalance ?? 0).toLocaleString('en-IN')}`}
            </Badge>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Badge variant="neutral">Season {seasonYearForInwardDate(source.date)}</Badge>
          {isCardExpanded && (
            <Badge variant="primary">{sourceBags} Bags</Badge>
          )}
        </div>
      </div>

      {isCardExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
          {/* Section 1: Bag Type Configuration */}
          <div
            style={{
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
                paddingBottom: isBagTypeExpanded ? 'var(--space-1-5)' : 0,
                borderBottom: isBagTypeExpanded ? '1px solid var(--color-border)' : 'none',
              }}
              onClick={() => setIsBagTypeExpanded((prev) => !prev)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={isBagTypeExpanded ? `Collapse Bag Type for GRN #${source.grnNumber}` : `Expand Bag Type for GRN #${source.grnNumber}`}
                  style={{
                    padding: 0,
                    minWidth: 'auto',
                    height: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {isBagTypeExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </Button>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--font-bold)',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-secondary)',
                    letterSpacing: 'var(--tracking-label)',
                  }}
                >
                  Bag Type Configuration — GRN #{source.grnNumber}
                </span>
              </div>
              <Badge variant="neutral">Bag Confirmation</Badge>
            </div>
            {isBagTypeExpanded && (
              <div style={{ marginTop: 'var(--space-1-5)' }}>
                <MergeBagTypeFields
                  value={confirmation}
                  onChange={onConfirmationChange}
                  totalMovedBags={sourceBags}
                  rentType={source.rentType}
                  inwardDate={source.date}
                  movementDate={movementDate}
                  submitting={submitting}
                  rates={rates}
                  sourceBagType={source.bagType}
                />
              </div>
            )}
          </div>

          {/* Section 2: Source GRN Rent Ledger Status (Not Outwarded) */}
          <div
            style={{
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 'var(--text-xs)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
                Source GRN Rent Ledger Status (Not Outwarded)
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {source.rentPaymentStatus === 'Settled' || (summary && summary.remainingBalance === 0)
                  ? 'All historical storage obligations are settled.'
                  : `Dues remain as an independent collectible bill under ${source.customerName || 'Customer'} in /rent.`}
              </span>
            </div>
            <Badge variant={source.rentPaymentStatus === 'Settled' || (summary && summary.remainingBalance === 0) ? 'success' : 'warning'}>
              {source.rentPaymentStatus === 'Settled' || (summary && summary.remainingBalance === 0)
                ? 'Settled (₹0 Due)'
                : `₹${(summary?.remainingBalance ?? source.rentRemainingBalance ?? 0).toLocaleString('en-IN')} Pending`}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
