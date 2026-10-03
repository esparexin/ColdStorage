'use client';

import React from 'react';
import { FeedbackStates } from './FeedbackStates';
import { Pagination } from './Pagination';
import styles from './DataTable.module.css';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Renders the cell content. Return value must be renderable (string, number, ReactNode). */
  render: (row: T, index: number) => React.ReactNode;
  /** Optional alignment override. Defaults to 'left'. */
  align?: 'left' | 'right' | 'center';
}

export interface DataTablePagination {
  page: number;
  totalPages: number;
  totalRecords?: number;
  onPageChange: (newPage: number) => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Unique key extractor for each row */
  rowKey: (row: T, index: number) => string;
  caption?: string;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
    id?: string;
  };
  pagination?: DataTablePagination;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  loadingLabel,
  error,
  onRetry,
  emptyMessage,
  emptyAction,
  pagination,
}: DataTableProps<T>) {
  if (loading) {
    return <FeedbackStates.Loading label={loadingLabel ?? 'Loading data...'} />;
  }

  if (error) {
    return <FeedbackStates.Error message={error} onRetry={onRetry} />;
  }

  if (rows.length === 0 && (emptyMessage || emptyAction)) {
    return (
      <FeedbackStates.Empty
        message={emptyMessage ?? 'No records found.'}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.tableWrapper} role="region" aria-label={caption}>
        <table className={styles.table}>
          {caption && <caption className={styles.caption}>{caption}</caption>}
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={styles.th}
                  style={{ textAlign: col.align ?? 'left' }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.emptyCell}>
                  {emptyMessage ?? 'No records found.'}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={rowKey(row, index)} className={styles.tr}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={styles.td}
                      style={{ textAlign: col.align ?? 'left' }}
                    >
                      {col.render(row, index)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalRecords={pagination.totalRecords}
          onPageChange={pagination.onPageChange}
        />
      )}
    </div>
  );
}
