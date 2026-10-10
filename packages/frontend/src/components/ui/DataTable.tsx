'use client';

import React from 'react';
import { FeedbackStates } from './FeedbackStates';
import { Pagination } from './Pagination';
import styles from './DataTable.module.css';

export interface DataTableColumnGroup {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  borderLeft?: boolean;
}

export interface DataTableColumn<T> {
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
}: DataTableProps<T>) {
  if (loading) {
    return <FeedbackStates.Loading label={loadingLabel ?? 'Loading data…'} />;
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

  const hasGroups = Boolean(groups && groups.length > 0);

  return (
    <div className={styles.container}>
      <div className={styles.tableWrapper} role="region" aria-label={caption}>
        <table className={styles.table}>
          {caption && <caption className={styles.caption}>{caption}</caption>}
          <thead>
            {hasGroups ? (
              <>
                <tr>
                  {(() => {
                    const renderedGroups = new Set<string>();
                    return columns.map((col) => {
                      if (!col.group) {
                        return (
                          <th
                            key={col.key}
                            scope="col"
                            rowSpan={2}
                            className={styles.th}
                            style={{
                              textAlign: col.align ?? 'left',
                              borderLeft: col.borderLeft ? '1px solid var(--color-border)' : undefined,
                            }}
                          >
                            {col.header}
                          </th>
                        );
                      }
                      if (renderedGroups.has(col.group)) {
                        return null;
                      }
                      renderedGroups.add(col.group);
                      const groupDef = groups!.find((g) => g.key === col.group);
                      const colSpan = columns.filter((c) => c.group === col.group).length;
                      return (
                        <th
                          key={`group-${col.group}`}
                          scope="colgroup"
                          colSpan={colSpan}
                          className={styles.th}
                          style={{
                            textAlign: groupDef?.align ?? 'center',
                            borderLeft: groupDef?.borderLeft || col.borderLeft ? '1px solid var(--color-border)' : undefined,
                          }}
                        >
                          {groupDef?.header ?? col.group}
                        </th>
                      );
                    });
                  })()}
                </tr>
                <tr>
                  {columns
                    .filter((col) => Boolean(col.group))
                    .map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className={styles.th}
                        style={{
                          textAlign: col.align ?? 'left',
                          borderLeft: col.borderLeft ? '1px solid var(--color-border)' : undefined,
                        }}
                      >
                        {col.header}
                      </th>
                    ))}
                </tr>
              </>
            ) : (
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={styles.th}
                    style={{
                      textAlign: col.align ?? 'left',
                      borderLeft: col.borderLeft ? '1px solid var(--color-border)' : undefined,
                    }}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            )}
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
                      style={{
                        textAlign: col.align ?? 'left',
                        borderLeft: col.borderLeft ? '1px solid var(--color-border)' : undefined,
                      }}
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
          pageSize={pagination.pageSize}
          totalPages={pagination.totalPages}
          totalRecords={pagination.totalRecords}
          onPageChange={pagination.onPageChange}
        />
      )}
    </div>
  );
}
