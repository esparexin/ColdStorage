'use client';

import React from 'react';
import { GitMerge } from 'lucide-react';
import type { BagType, Grn, GrnInventorySummary, OutwardBagCategory, RentSummaryDto } from '@cold-storage/contracts';
import { formatDisplayBagType, isHybridBagCategory, parseMergedConsignmentBreakdown } from '@cold-storage/contracts';
import { Badge, Button, Select } from '@/components/ui';
import {
  parseMergedAddedBags,
  parseMergedRepackedDetail,
  parseMergedSourceGrns,
} from '../hooks/eligibleGrn.helper';
import { formatGrnDate } from './EligibleGrnColumns';
import styles from './SelectedGrnCard.module.css';

interface SelectedGrnCardProps {
  grn: Grn;
  summary?: GrnInventorySummary | null;
  rentSummary?: RentSummaryDto | null;
  onChangeGrn: () => void;
  bagType?: BagType;
  bagCategory?: OutwardBagCategory;
  onBagTypeChange?: (bagType: BagType) => void;
  onBagCategoryChange?: (category: OutwardBagCategory) => void;
}

export function SelectedGrnCard({
  grn,
  summary,
  rentSummary,
  onChangeGrn,
  bagType,
  bagCategory,
  onBagTypeChange,
  onBagCategoryChange,
}: SelectedGrnCardProps) {
  const availableBags = summary
    ? summary.availableSmallBags + summary.availableBigBags
    : (grn.closingBags ?? grn.bags);
  const breakdown =
    rentSummary?.mergedConsignment ??
    parseMergedConsignmentBreakdown(grn.remarks, grn.bags, grn.customerName);
  const safeAddedBags = breakdown ? breakdown.totalMergedAddedBags : (parseMergedAddedBags(grn.remarks) ?? 0);
  const isMergedConsignment = safeAddedBags > 0;
  const isDualSectionMerged = Boolean(
    breakdown &&
    breakdown.isMergedTarget &&
    breakdown.genesisBags > 0 &&
    breakdown.totalMergedAddedBags > 0,
  );
  const hasTypeSelection = !isDualSectionMerged && Boolean(onBagTypeChange || onBagCategoryChange);
  const selectedBagCategory = bagCategory ?? (bagType ? (bagType === 'Hybrid' ? 'Hybrid' : 'S/B') : undefined);
  const isHybrid = selectedBagCategory
    ? isHybridBagCategory(selectedBagCategory)
    : (bagType === 'Hybrid' || isHybridBagCategory(grn.bagType));
  const mergedFrom = breakdown && breakdown.sources.length > 0
    ? Array.from(new Set(breakdown.sources.map((s) => s.grnNumber))).join(', ')
    : parseMergedSourceGrns(grn.remarks);
  const repackedDetail = parseMergedRepackedDetail(grn.remarks);
  const genesisInwardBags = breakdown
    ? breakdown.genesisBags
    : (isMergedConsignment && grn.bags > safeAddedBags ? grn.bags - safeAddedBags : grn.bags);
  const displayBagType = isDualSectionMerged
    ? `${genesisInwardBags} Unclassified + ${safeAddedBags} Confirmed`
    : formatDisplayBagType({
        bagType: grn.bagType,
        isHybrid,
        smallBags: grn.smallBags,
        bigBags: grn.bigBags,
        isCompositionVerified: grn.isCompositionVerified,
      });

  return (
    <div className={styles.card} id="selected-grn-summary-card">
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <strong className={styles.grnNumber}>{grn.grnNumber}</strong>
          <span className={styles.inwardDateBadge}>
            Inward: {formatGrnDate(grn.date)}
          </span>
          <Badge variant="neutral">{grn.rentType}</Badge>
          {mergedFrom && (
            <Badge variant="primary" icon={<GitMerge size={12} aria-hidden="true" />}>
              Includes GRN{mergedFrom.includes(',') ? 's' : ''} {mergedFrom}
            </Badge>
          )}
        </div>
        <Button
          id="change-selected-grn-btn"
          type="button"
          variant="outline"
          size="sm"
          onClick={onChangeGrn}
        >
          Change GRN
        </Button>
      </div>

      <div className={styles.detailsGrid}>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Customer</span>
          <span className={styles.detailValue}>{grn.customerName}</span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Commodity / Ch</span>
          <span className={styles.detailValue}>
            {grn.commodityName} (Ch {grn.chamber})
          </span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Storage Mark</span>
          <span className={styles.detailValue}>
            {grn.storageMark || grn.grnNumber}
          </span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Party Mark</span>
          <span className={styles.detailValue}>{grn.partyMark || '—'}</span>
        </div>

        {isMergedConsignment ? (
          <>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Genesis Inward Bags</span>
              <span className={styles.detailValue}>
                {genesisInwardBags.toLocaleString('en-IN')} bags
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>New Bags Added</span>
              <span
                className={styles.detailValue}
                style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-semibold)' }}
              >
                +{safeAddedBags.toLocaleString('en-IN')} repacked bags
                {repackedDetail ? ` (${repackedDetail})` : ''}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Total Stock</span>
              <strong
                className={styles.detailValue}
                style={{ color: 'var(--color-success-text)', fontSize: 'var(--text-sm)' }}
              >
                {grn.bags.toLocaleString('en-IN')} bags
              </strong>
            </div>
            {availableBags !== grn.bags && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Available Stock</span>
                <strong className={styles.detailValue}>
                  {availableBags.toLocaleString('en-IN')} bags
                </strong>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Received</span>
              <span className={styles.detailValue}>
                {grn.bags.toLocaleString('en-IN')} bags
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Available Stock</span>
              <strong className={styles.detailValue}>
                {availableBags.toLocaleString('en-IN')} bags
              </strong>
            </div>
          </>
        )}

        {hasTypeSelection ? (
          <div className={styles.detailItem}>
            <Select
              id="delivery-bag-type-select"
              label="Bag Type"
              value={isHybrid ? 'Hybrid' : 'S/B'}
              onChange={(e) => {
                const val = e.target.value as BagType;
                if (onBagTypeChange) onBagTypeChange(val);
                if (onBagCategoryChange) onBagCategoryChange(val as OutwardBagCategory);
              }}
            >
              <option value="S/B">Small &amp; Big (S/B)</option>
              <option value="Hybrid">Hybrid</option>
            </Select>
          </div>
        ) : (
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Bag Type</span>
            <span className={styles.detailValue}>
              <Badge variant="neutral">{displayBagType}</Badge>
            </span>
          </div>
        )}
        {mergedFrom && (
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Source Traceability</span>
            <span
              className={styles.detailValue}
              style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-semibold)' }}
            >
              Includes GRN{mergedFrom.includes(',') ? 's' : ''} {mergedFrom}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
