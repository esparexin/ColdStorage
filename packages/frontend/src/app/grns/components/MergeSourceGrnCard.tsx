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

  const isConfirmed = rentCalc.isConfirmed;
  const paid = summary?.totalPaid ?? 0;
  const totalObligation = Math.max(summary?.totalDue ?? 0, rentCalc.totalAmountToPay);
  const pendingDues = Math.max(0, totalObligation - paid);
  const isSettled = totalObligation === 0 || (paid >= totalObligation && totalObligation > 0);

  return (
    <div className={styles.compactCard} id={`source-card-${source.id}`}>
      <div
        className={styles.cardHeader}
        style={{ cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap', gap: '8px' }}
        onClick={() => setIsCardExpanded((prev) => !prev)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
          <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
          <span style={{ fontWeight: 'var(--font-semibold)', textTransform: 'uppercase', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)' }}>
            {source.customerName || 'CUSTOMER'}
          </span>
          <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
          <Badge variant="primary">{sourceBags} Bags</Badge>
          <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
          <Badge variant={isConfirmed ? (isSettled ? 'success' : 'neutral') : 'neutral'}>
            {!isConfirmed
              ? 'Awaiting Bag Confirmation'
              : isSettled
                ? 'Charges Settled (₹0 Due)'
                : `Calculated Charges: ₹${rentCalc.totalAmountToPay.toLocaleString('en-IN')}`}
          </Badge>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Badge variant="neutral">Season {seasonYearForInwardDate(source.date)}</Badge>
        </div>
      </div>

      {isCardExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
          {isConfirmed && (
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                background: 'var(--color-surface-2)',
                padding: 'var(--space-1) var(--space-2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <span>Rent Charge: <strong>₹{rentCalc.totalRent.toLocaleString('en-IN')}</strong></span>
              <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
              <span>Hamali Charge ({sourceBags} bags @ ₹{commodityHamaliRate}/bag): <strong>₹{rentCalc.hamaliAmount.toLocaleString('en-IN')}</strong></span>
              {paid > 0 && (
                <>
                  <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
                  <span>Previously Paid: <strong>₹{paid.toLocaleString('en-IN')}</strong></span>
                </>
              )}
            </div>
          )}

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
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Bag Configuration
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
        </div>
      )}
    </div>
  );
}
