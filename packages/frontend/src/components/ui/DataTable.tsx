'use client';

import React from 'react';
import { DataTableHead } from './DataTableHead';
import { FeedbackStates } from './FeedbackStates';
import { Pagination } from './Pagination';
import {
  getNextSortDirection,
  isInteractiveTarget,
  shouldTriggerRowClickOnKey,
  sortRows,
  type SortDirection,
  type SortableColumn,
  type SortType,
} from './dataTable.helper';
import styles from './DataTable.module.css';

export type { SortDirection, SortType };

export interface DataTableColumnGroup {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  borderLeft?: boolean;
}

export interface DataTableColumn<T> extends SortableColumn<T> {
  key: string;
  header: React.ReactNode;
  /** Renders the cell content. Return value must be renderable (string, number, ReactNode). */
  render: (row: T, index: number) => React.ReactNode;
  /** Optional alignment override. Defaults to 'left'. */
  align?: 'left' | 'right' | 'center';
  /** Optional group key linking this column to a DataTableColumnGroup */
  group?: string;
  /** Optional left border to visually partition column groups */
  borderLeft?: boolean;
  /** Whether the column header can be clicked to sort */
  sortable?: boolean;
  /** Custom sort accessor function returning a primitive or Date */
  sortAccessor?: (row: T) => string | number | Date | null | undefined;
  /** Explicit type override for sorting comparison */
  sortType?: SortType;
}

export interface DataTablePagination {
  page: number;
  /** Rows per page; drives the "Showing X-Y of Z" range. */
  pageSize: number;
  totalPages: number;
  totalRecords: number;
  onPageChange: (newPage: number) => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  groups?: DataTableColumnGroup[];
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
  onRowClick?: (row: T, index: number) => void;
  footer?: React.ReactNode;
  /** Active sort column key (controlled sorting) */
  sortBy?: string;
  /** Active sort direction (controlled sorting) */
  sortDirection?: SortDirection;
  /** Callback fired when a sortable column header is clicked */
  onSortChange?: (sortKey: string, direction: SortDirection) => void;
  /** Default sort column key (uncontrolled sorting) */
  defaultSortBy?: string;
  /** Default sort direction (uncontrolled sorting) */
  defaultSortDirection?: SortDirection;
}

export function DataTable<T>({
  columns,
  groups,
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
  onRowClick,
  footer,
  sortBy,
  sortDirection,
  onSortChange,
  defaultSortBy,
  defaultSortDirection,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = React.useState<{
    key: string;
    direction: SortDirection;
  } | null>(() =>
    defaultSortBy ? { key: defaultSortBy, direction: defaultSortDirection ?? 'asc' } : null,
  );

  const activeSortKey = sortBy !== undefined ? sortBy : internalSort?.key;
  const activeSortDir = sortDirection !== undefined ? sortDirection : internalSort?.direction;

  const handleSortClick = (colKey: string) => {
    const nextDir = getNextSortDirection(activeSortKey ?? null, colKey, activeSortDir);
    if (onSortChange) {
      onSortChange(colKey, nextDir);
    }
    if (sortBy === undefined) {
      setInternalSort({ key: colKey, direction: nextDir });
    }
  };

  const displayRows = React.useMemo(() => {
    if (sortBy !== undefined || !activeSortKey || !activeSortDir) {
      return rows;
    }
    const targetCol = columns.find((c) => c.key === activeSortKey);
    if (!targetCol || !targetCol.sortable) {
      return rows;
    }
    return sortRows(rows, targetCol, activeSortDir);
  }, [rows, columns, sortBy, activeSortKey, activeSortDir]);

  if (loading) {
    return <FeedbackStates.Loading label={loadingLabel ?? 'Loading data…'} />;
  }

  if (error) {
    return <FeedbackStates.Error message={error} onRetry={onRetry} />;
  }

  if (displayRows.length === 0 && (emptyMessage || emptyAction)) {
    return (
      <FeedbackStates.Empty message={emptyMessage ?? 'No records found.'} action={emptyAction} />
    );
  }

  return (
    <div className={styles.container}>
      <div
        className={styles.tableWrapper}
        role={caption ? 'region' : undefined}
        aria-label={caption}
      >
        <table className={styles.table}>
          {caption && <caption className={styles.caption}>{caption}</caption>}
          <DataTableHead
            columns={columns}
            groups={groups}
            activeSortKey={activeSortKey}
            activeSortDir={activeSortDir}
            onSortClick={handleSortClick}
          />
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.emptyCell}>
                  {emptyMessage ?? 'No records found.'}
                </td>
              </tr>
            ) : (
              displayRows.map((row, index) => {
                const isClickable = Boolean(onRowClick);
                return (
                  <tr
                    key={rowKey(row, index)}
                    className={`${styles.tr} ${isClickable ? styles.clickableRow : ''}`.trim()}
                    onClick={
                      isClickable
                        ? (e) => {
                            if (!isInteractiveTarget(e.target)) onRowClick?.(row, index);
                          }
                        : undefined
                    }
                    onKeyDown={
                      isClickable
                        ? (e) => {
                            if (
                              !isInteractiveTarget(e.target) &&
                              shouldTriggerRowClickOnKey(e.key)
                            ) {
                              e.preventDefault();
                              onRowClick?.(row, index);
                            }
                          }
                        : undefined
                    }
                    tabIndex={isClickable ? 0 : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={styles.td}
                        style={{
                          textAlign: col.align ?? 'left',
                          borderLeft: col.borderLeft ? '1px solid var(--color-border)' : undefined,
                        }}
                      >
                        {col.render(row, index)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>

      {pagination && (
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalPages={pagination.totalPages}
          totalRecords={pagination.totalRecords}
          onPageChange={pagination.onPageChange}
        />
      )}
    </div>
  );
}
