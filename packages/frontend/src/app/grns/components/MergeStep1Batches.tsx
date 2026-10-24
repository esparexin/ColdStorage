'use client';

import React, { useMemo, useState } from 'react';
import { formatDisplayBagType, seasonYearForInwardDate, type Grn } from '@cold-storage/contracts';
import { Badge, Button, Input } from '@/components/ui';
import { DestinationGrnCombobox } from './DestinationGrnCombobox';
import { MergeSourceTable } from './MergeSourceTable';
import { SelectedSourcesPanel } from './SelectedSourcesPanel';
import { WizardStepActions } from './WizardStepActions';
import modalStyles from './InternalMovementModal.module.css';
import stepStyles from './MergeStep1Batches.module.css';

interface MergeStep1BatchesProps {
  openGrns: Grn[]; targetOptions?: Grn[]; targetGrnId: string; onTargetGrnChange: (id: string) => void;
  targetGrn: Grn; targetSeason: number; targetCurrentRemaining: number; isTargetHybrid: boolean;
  eligibleSources: Grn[]; selectedSourceIds: string[]; selectedSources: Grn[]; totalSourceBags: number;
  futureSeasonCount: number; submitting: boolean; recommendedSwitchGrn?: Grn | null;
  onSwitchTarget?: (targetId: string) => void; onToggleSource: (id: string) => void; onNext: () => void;
  initiatingGrnId?: string;
}

export function MergeStep1Batches({
  openGrns, targetOptions, targetGrnId, onTargetGrnChange, targetGrn, targetSeason,
  targetCurrentRemaining, isTargetHybrid, eligibleSources, selectedSourceIds, selectedSources,
  totalSourceBags, futureSeasonCount, submitting, recommendedSwitchGrn, onSwitchTarget,
  onToggleSource, onNext, initiatingGrnId,
}: MergeStep1BatchesProps) {
  const [sourceSearch, setSourceSearch] = useState('');

  const targetOptionsList = useMemo(() => {
    return targetOptions ?? openGrns;
  }, [targetOptions, openGrns]);

  const filteredSourceList = useMemo(() => {
    if (!sourceSearch.trim()) return eligibleSources;
    const q = sourceSearch.trim().toLowerCase();
    return eligibleSources.filter((g) =>
      g.grnNumber.toLowerCase().includes(q) ||
      g.customerName.toLowerCase().includes(q) ||
      g.commodityName.toLowerCase().includes(q),
    );
  }, [eligibleSources, sourceSearch]);

  const targetDisplayType = formatDisplayBagType({
    bagType: targetGrn.bagType,
    smallBags: targetGrn.smallBags,
    bigBags: targetGrn.bigBags,
    isHybrid: isTargetHybrid,
    isCompositionVerified: targetGrn.isCompositionVerified,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* 1. Target GRN (Destination) Card */}
      <div
        className={modalStyles.compactCard}
        style={{
          background: 'var(--color-surface-2)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              1. Target GRN (Merge Destination)
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              This GRN remains open and receives all stock from the merged source lots.
            </div>
          </div>
          <Badge variant="primary">Receiving Lot</Badge>
        </div>

        <div>
          <DestinationGrnCombobox
            targetOptions={targetOptionsList}
            targetGrnId={targetGrnId}
            onSelectTarget={onTargetGrnChange}
            disabled={submitting}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-2)',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div className={modalStyles.metaItem}>
            <span className={modalStyles.metaLabel}>Customer</span>
            <span className={modalStyles.metaValue}>{targetGrn.customerName}</span>
          </div>
          <div className={modalStyles.metaItem}>
            <span className={modalStyles.metaLabel}>Commodity / Chamber</span>
            <span className={modalStyles.metaValue}>{targetGrn.commodityName} (Ch. {targetGrn.chamber})</span>
          </div>
          <div className={modalStyles.metaItem}>
            <span className={modalStyles.metaLabel}>Current Stock</span>
            <span className={modalStyles.metaValue} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span>{targetCurrentRemaining} Bags</span>
              {targetDisplayType !== 'Unconfirmed' && (
                <Badge variant="neutral">{targetDisplayType}</Badge>
              )}
            </span>
          </div>
          <div className={modalStyles.metaItem}>
            <span className={modalStyles.metaLabel}>Applicable Season</span>
            <span className={modalStyles.metaValue}>Season {targetSeason}</span>
          </div>
        </div>
      </div>

      {/* 2. Source GRNs to Merge Card */}
      <div
        className={modalStyles.compactCard}
        style={{
          background: 'var(--color-surface-2)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              2. Select Source GRN(s) to Merge
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Choose one or more source GRNs to consolidate into GRN #{targetGrn.grnNumber}. These GRNs will be closed upon merge.
            </div>
          </div>
        </div>

        <SelectedSourcesPanel
          selectedSources={selectedSources}
          totalSourceBags={totalSourceBags}
          onDeselectSource={onToggleSource}
        />

        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Input
              id="source-grn-search"
              type="search"
              placeholder="Search source lots by GRN #, Customer, or Commodity..."
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
          <div className={modalStyles.noticeBox} style={{ color: 'var(--color-warning-text)', borderColor: 'var(--color-warning)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
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
                  Set {recommendedSwitchGrn.grnNumber} (Season {seasonYearForInwardDate(recommendedSwitchGrn.date)}) as Target
                </Button>
              </div>
            )}
          </div>
        )}

        <div className={stepStyles.sourceTableScrollContainer}>
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
      </div>

      <WizardStepActions
        stepInfoText="Step 1 of 4 • Select target GRN and source lot(s) to merge"
        onNext={onNext}
        nextLabel="Next: Confirm Bag Type & History"
        disabled={selectedSourceIds.length === 0}
        submitting={submitting}
      />
    </div>
  );
}
