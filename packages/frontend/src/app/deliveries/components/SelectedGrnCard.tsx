'use client';

import type { BagType, Grn, GrnInventorySummary, OutwardBagCategory } from '@cold-storage/contracts';
import { isHybridBagCategory } from '@cold-storage/contracts';
import { Badge, Button, Select } from '@/components/ui';
import { formatGrnDate } from './EligibleGrnColumns';
import styles from './SelectedGrnCard.module.css';

interface SelectedGrnCardProps {
  grn: Grn;
  summary?: GrnInventorySummary | null;
  onChangeGrn: () => void;
  bagType?: BagType;
  bagCategory?: OutwardBagCategory;
  onBagTypeChange?: (bagType: BagType) => void;
  onBagCategoryChange?: (category: OutwardBagCategory) => void;
}

export function SelectedGrnCard({
  grn,
  summary,
  onChangeGrn,
  bagType,
  bagCategory,
  onBagTypeChange,
  onBagCategoryChange,
}: SelectedGrnCardProps) {
  const availableBags = summary
    ? summary.availableSmallBags + summary.availableBigBags
    : (grn.closingBags ?? grn.bags);

  return (
    <div className={styles.card} id="selected-grn-summary-card">
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <strong className={styles.grnNumber}>{grn.grnNumber}</strong>
          <span className={styles.inwardDateBadge}>
            Inward: {formatGrnDate(grn.date)}
          </span>
          <Badge variant="neutral">{grn.rentType}</Badge>
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
        {(onBagTypeChange || onBagCategoryChange) && (
          <div className={styles.detailItem}>
            <Select
              id="delivery-bag-type-select"
              label="Bag Type"
              value={bagType === 'Hybrid' || isHybridBagCategory(bagCategory) ? 'Hybrid' : 'S/B'}
              onChange={(e) => {
                const val = e.target.value as BagType;
                if (onBagTypeChange) onBagTypeChange(val);
                if (onBagCategoryChange) onBagCategoryChange(val as OutwardBagCategory);
              }}
            >
              <option value="S/B">Small &amp; Big</option>
              <option value="Hybrid">Hybrid</option>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
