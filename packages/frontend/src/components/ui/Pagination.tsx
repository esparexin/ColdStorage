'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import styles from './Pagination.module.css';

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number;
  onPageChange: (newPage: number) => void;
}

/**
 * The single pagination control for every list screen. It is rendered only by
 * DataTable, so a screen can never grow a second, divergent implementation.
 */
export function Pagination({
  page,
  pageSize,
  totalPages,
  totalRecords,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1 || totalRecords === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalRecords);

  return (
    <div className={styles.pagination} role="navigation" aria-label="Pagination">
      <p className={styles.info} aria-live="polite">
        Showing <span className={styles.range}>{first}&ndash;{last}</span> of{' '}
        <span className={styles.range}>{totalRecords.toLocaleString('en-IN')}</span>
      </p>

      <div className={styles.controls}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
          leftIcon={<ChevronLeft size={14} aria-hidden="true" />}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
          rightIcon={<ChevronRight size={14} aria-hidden="true" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
}