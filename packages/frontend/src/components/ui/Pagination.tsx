'use client';

import React from 'react';
import { Button } from './Button';
import styles from './Pagination.module.css';

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalRecords?: number;
  onPageChange: (newPage: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  totalRecords,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={`${styles.pagination} ${className ?? ''}`} role="navigation" aria-label="Pagination">
      <span className={styles.info}>
        Page {page} of {totalPages}
        {totalRecords !== undefined ? ` (${totalRecords} total records)` : ''}
      </span>

      <div className={styles.controls}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
