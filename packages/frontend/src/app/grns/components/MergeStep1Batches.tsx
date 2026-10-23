'use client';

import React from 'react';
import { formatDisplayBagType, seasonYearForInwardDate, type Grn } from '@cold-storage/contracts';
import { Badge, Select } from '@/components/ui';
import { MergeSourceTable } from './MergeSourceTable';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

interface MergeStep1BatchesProps {
  openGrns: Grn[];
  targetGrnId: string;
  onTargetGrnChange: (id: string) => void;
  targetGrn: Grn;
  targetSeason: number;
  targetCurrentRemaining: number;
  isTargetHybrid: boolean;
  eligibleSources: Grn[];
  selectedSourceIds: string[];
  selectedSources: Grn[];
  totalSourceBags: number;
  futureSeasonCount: number;
  submitting: boolean;
  onToggleSource: (id: string) => void;
  onNext: () => void;
}

export function MergeStep1Batches({
  openGrns,
  targetGrnId,
  onTargetGrnChange,
  targetGrn,
  targetSeason,
  targetCurrentRemaining,
  isTargetHybrid,
  eligibleSources,
  selectedSourceIds,
  selectedSources,
  totalSourceBags,
  futureSeasonCount,
  submitting,
  onToggleSource,
  onNext,
}: MergeStep1BatchesProps) {
  const isTargetSbSplit = targetGrn.smallBags > 0 || targetGrn.bigBags > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.summaryStrip}>
        <div style={{ flex: '1 1 240px', minWidth: '180px' }}>
          <Select
            id="target-grn-selector"
            label="1. Surviving Target GRN"
            value={targetGrnId}
            onChange={(e) => onTargetGrnChange(e.target.value)}
            disabled={submitting}
          >
            {openGrns.map((g) => (
              <option key={g.id} value={g.id}>
                {g.grnNumber} — {g.customerName} ({g.closingBags ?? g.bags} bags, Season {seasonYearForInwardDate(g.date)})
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Customer</span>
          <span className={styles.metaValue}>{targetGrn.customerName}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Commodity / Chamber</span>
          <span className={styles.metaValue}>{targetGrn.commodityName} (Ch. {targetGrn.chamber})</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Current Stock & Type</span>
          <span className={styles.metaValue} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span>{targetCurrentRemaining} Bags</span>
            <Badge variant={targetGrn.isCompositionVerified === false ? 'warning' : 'neutral'}>
              {formatDisplayBagType({
                bagType: targetGrn.bagType,
                smallBags: targetGrn.smallBags,
                bigBags: targetGrn.bigBags,
                isHybrid: isTargetHybrid,
                isCompositionVerified: targetGrn.isCompositionVerified,
              })}
            </Badge>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {isTargetHybrid
                ? '(Uniform Rate)'
                : targetGrn.isCompositionVerified && targetCurrentRemaining === (targetGrn.smallBags ?? 0) + (targetGrn.bigBags ?? 0) && isTargetSbSplit
                  ? `(${targetGrn.smallBags ?? 0}S · ${targetGrn.bigBags ?? 0}B)`
                  : targetGrn.isCompositionVerified && (targetGrn.bigBags ?? 0) === 0 && (targetGrn.smallBags ?? 0) > 0
                    ? `(${targetCurrentRemaining}S · 0B)`
                    : targetGrn.isCompositionVerified && (targetGrn.smallBags ?? 0) === 0 && (targetGrn.bigBags ?? 0) > 0
                      ? `(0S · ${targetCurrentRemaining}B)`
                      : ''}
            </span>
          </span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Applicable Season</span>
          <span className={styles.metaValue}>Season {targetSeason}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
          <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            2. Source GRNs to Merge ({selectedSources.length} of {eligibleSources.length} selected)
          </span>
          <span style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-semibold)' }}>
            +{totalSourceBags} Bags Selected
          </span>
        </div>
        {futureSeasonCount > 0 && (
          <div className={styles.noticeBox} style={{ color: 'var(--color-warning-text)', borderColor: 'var(--color-warning)' }}>
            Notice: {futureSeasonCount} future-season batch{futureSeasonCount === 1 ? '' : 'es'} in this facility {futureSeasonCount === 1 ? 'is' : 'are'} hidden — only batches received in Season {targetSeason} or earlier can merge into this GRN.
          </div>
        )}
        <MergeSourceTable
          eligibleSources={eligibleSources}
          selectedSourceIds={selectedSourceIds}
          targetGrnDate={targetGrn.date}
          submitting={submitting}
          onToggleSource={onToggleSource}
        />
      </div>

      <WizardStepActions
        stepInfoText="Step 1 of 4 • Select surviving batch and source batches"
        onNext={onNext}
        nextLabel="Next: Confirm Bag Type & History"
        disabled={selectedSourceIds.length === 0}
        submitting={submitting}
      />
    </div>
  );
}
