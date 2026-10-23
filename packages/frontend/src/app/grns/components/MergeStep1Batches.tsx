'use client';

import React, { useMemo, useState } from 'react';
import { formatDisplayBagType, seasonYearForInwardDate, type Grn } from '@cold-storage/contracts';
import { Badge, Button, Input, Select } from '@/components/ui';
import { MergeSourceTable } from './MergeSourceTable';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

interface MergeStep1BatchesProps {
  openGrns: Grn[];
  targetOptions?: Grn[];
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
  recommendedSwitchGrn?: Grn | null;
  onSwitchTarget?: (targetId: string) => void;
  onToggleSource: (id: string) => void;
  onNext: () => void;
  initiatingGrnId?: string;
}

export function MergeStep1Batches({
  openGrns,
  targetOptions,
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
  recommendedSwitchGrn,
  onSwitchTarget,
  onToggleSource,
  onNext,
  initiatingGrnId,
}: MergeStep1BatchesProps) {
  const [targetSearch, setTargetSearch] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');

  const filteredTargetOptions = useMemo(() => {
    const list = targetOptions ?? openGrns;
    if (!targetSearch.trim()) return list;
    const q = targetSearch.trim().toLowerCase();
    return list.filter((g) =>
      g.grnNumber.toLowerCase().includes(q) ||
      g.customerName.toLowerCase().includes(q) ||
      g.commodityName.toLowerCase().includes(q) ||
      g.id === targetGrnId,
    );
  }, [targetOptions, openGrns, targetSearch, targetGrnId]);

  const filteredSourceList = useMemo(() => {
    if (!sourceSearch.trim()) return eligibleSources;
    const q = sourceSearch.trim().toLowerCase();
    return eligibleSources.filter((g) =>
      g.grnNumber.toLowerCase().includes(q) ||
      g.customerName.toLowerCase().includes(q) ||
      g.commodityName.toLowerCase().includes(q),
    );
  }, [eligibleSources, sourceSearch]);

  const isTargetSbSplit = targetGrn.smallBags > 0 || targetGrn.bigBags > 0;
  const targetDisplayType = formatDisplayBagType({
    bagType: targetGrn.bagType,
    smallBags: targetGrn.smallBags,
    bigBags: targetGrn.bigBags,
    isHybrid: isTargetHybrid,
    isCompositionVerified: targetGrn.isCompositionVerified,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.summaryStrip}>
        <div style={{ flex: '1 1 260px', minWidth: '200px', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <Input
            id="target-grn-search"
            type="search"
            placeholder="Search destination GRN / Customer..."
            value={targetSearch}
            onChange={(e) => setTargetSearch(e.target.value)}
            disabled={submitting}
            aria-label="Filter Surviving Destination GRNs"
          />
          <Select
            id="target-grn-selector"
            label="1. Surviving Target GRN"
            value={targetGrnId}
            onChange={(e) => onTargetGrnChange(e.target.value)}
            disabled={submitting}
          >
            {filteredTargetOptions.map((g) => (
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
            {targetDisplayType !== 'Unconfirmed' && (
              <Badge variant="neutral">{targetDisplayType}</Badge>
            )}
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
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Input
              id="source-grn-search"
              type="search"
              placeholder="Search source GRNs by number, customer, commodity..."
              value={sourceSearch}
              onChange={(e) => setSourceSearch(e.target.value)}
              disabled={submitting}
              aria-label="Filter Source GRNs"
            />
          </div>
          {sourceSearch.trim() && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              Showing {filteredSourceList.length} of {eligibleSources.length}
            </span>
          )}
        </div>
        {futureSeasonCount > 0 && (
          <div className={styles.noticeBox} style={{ color: 'var(--color-warning-text)', borderColor: 'var(--color-warning)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div>
              Notice: {futureSeasonCount} future-season batch{futureSeasonCount === 1 ? '' : 'es'} in this facility {futureSeasonCount === 1 ? 'is' : 'are'} hidden — only batches received in Season {targetSeason} or earlier can merge into this GRN.
            </div>
            {recommendedSwitchGrn && onSwitchTarget && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Merge forward into Season {seasonYearForInwardDate(recommendedSwitchGrn.date)}:
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onSwitchTarget(recommendedSwitchGrn.id)}
                  disabled={submitting}
                >
                  Set {recommendedSwitchGrn.grnNumber} (Season {seasonYearForInwardDate(recommendedSwitchGrn.date)}) as Surviving Target
                </Button>
              </div>
            )}
          </div>
        )}
        <MergeSourceTable
          eligibleSources={filteredSourceList}
          selectedSourceIds={selectedSourceIds}
          targetGrnDate={targetGrn.date}
          submitting={submitting}
          onToggleSource={onToggleSource}
          initiatingGrnId={initiatingGrnId}
          targetGrnId={targetGrnId}
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
