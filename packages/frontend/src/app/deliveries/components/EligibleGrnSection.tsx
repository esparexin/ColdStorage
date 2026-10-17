'use client';

import React, { useMemo, useState } from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { SearchBar } from '@/components/ui/SearchBar';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { DataTable } from '@/components/ui/DataTable';
import {
  INWARD_STOCK_PAGE_SIZE,
  filterEligibleGrns,
  getAvailableStockBags,
  paginateEligibleGrns,
} from '../hooks/eligibleGrn.helper';
import { createEligibleGrnColumns } from './EligibleGrnColumns';
import styles from './EligibleGrnSection.module.css';

interface EligibleGrnSectionProps {
  grns: Grn[];
  onSelectGrn: (grnId: string) => void;
}

export function EligibleGrnSection({
  grns,
  onSelectGrn,
}: EligibleGrnSectionProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [page, setPage] = useState(1);

  const filteredGrns = useMemo(
    () => filterEligibleGrns(grns, filterQuery),
    [grns, filterQuery],
  );

  const handleFilterChange = (query: string) => {
    setFilterQuery(query);
    setPage(1);
  };

  const { items, totalPages, safePage, totalRecords } = useMemo(
    () => paginateEligibleGrns(filteredGrns, page, INWARD_STOCK_PAGE_SIZE),
    [filteredGrns, page],
  );

  const columns = useMemo(
    () => createEligibleGrnColumns({ onSelectGrn }),
    [onSelectGrn],
  );

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
        <div className={styles.titleArea}>
          <h2 className={styles.sectionTitle}>Issue Outward Delivery Challan</h2>
          <div className={styles.stockBadgeGroup}>
            <span className={styles.stockBadgeLabel}>Inward Stock</span>
            <Badge variant="neutral">{totalRecords}</Badge>
          </div>
        </div>
        <div className={styles.searchWrapper}>
          <SearchBar
            id="eligible-grn-filter-search"
            value={filterQuery}
            onChange={handleFilterChange}
            placeholder="Search GRN, Customer, Commodity…"
            ariaLabel="Search inward stock"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(grn) => grn.id}
        emptyMessage={`No inward GRNs matching "${filterQuery}".`}
        onRowClick={(grn) => {
          if (grn.loanStatus !== 'TAKEN' && getAvailableStockBags(grn) > 0) {
            onSelectGrn(grn.id);
          }
        }}
        pagination={{
          page: safePage,
          pageSize: INWARD_STOCK_PAGE_SIZE,
          totalPages,
          totalRecords,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
