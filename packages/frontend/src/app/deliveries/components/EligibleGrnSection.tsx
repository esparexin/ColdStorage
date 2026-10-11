'use client';

import React, { useMemo, useState } from 'react';
import type { Grn } from '@cold-storage/contracts';
import { SearchBar } from '@/components/ui/SearchBar';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { EligibleGrnCard } from './EligibleGrnCard';
import styles from './EligibleGrnSection.module.css';

interface EligibleGrnSectionProps {
  grns: Grn[];
  selectedGrnId?: string;
  onSelectGrn: (grnId: string) => void;
}

export function EligibleGrnSection({
  grns,
  selectedGrnId,
  onSelectGrn,
}: EligibleGrnSectionProps) {
  const [filterQuery, setFilterQuery] = useState('');

  const filteredGrns = useMemo(() => {
    if (!filterQuery.trim()) return grns;
    const q = filterQuery.toLowerCase();
    return grns.filter(
      (g) =>
        g.grnNumber.toLowerCase().includes(q) ||
        g.customerName.toLowerCase().includes(q) ||
        g.commodityName.toLowerCase().includes(q) ||
        (g.storageMark && g.storageMark.toLowerCase().includes(q)) ||
        (g.partyMark && g.partyMark.toLowerCase().includes(q)),
    );
  }, [grns, filterQuery]);

  if (grns.length === 0) {
    return (
      <div className={styles.emptyArea}>
        <FeedbackStates.Empty message="No active Inward GRNs with stored stock found for this facility." />
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          Eligible Inward Stock ({filteredGrns.length} of {grns.length})
        </span>
        <div className={styles.searchWrapper}>
          <SearchBar
            id="eligible-grn-filter-search"
            value={filterQuery}
            onChange={setFilterQuery}
            placeholder="Search GRN, Customer, Commodity…"
            ariaLabel="Search eligible inward GRNs"
          />
        </div>
      </div>

      {filteredGrns.length === 0 ? (
        <div className={styles.emptyArea}>
          <FeedbackStates.Empty message={`No inward GRNs matching "${filterQuery}".`} />
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {filteredGrns.map((grn) => (
            <EligibleGrnCard
              key={grn.id}
              grn={grn}
              isSelected={grn.id === selectedGrnId}
              onSelect={onSelectGrn}
            />
          ))}
        </div>
      )}
    </div>
  );
}
