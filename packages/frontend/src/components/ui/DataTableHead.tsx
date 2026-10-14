'use client';

import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { DataTableColumn, DataTableColumnGroup } from './DataTable';
import type { SortDirection } from './dataTable.helper';
import styles from './DataTable.module.css';

interface DataTableHeadProps<T> {
  columns: DataTableColumn<T>[];
  groups?: DataTableColumnGroup[];
  activeSortKey?: string;
  activeSortDir?: SortDirection;
  onSortClick: (colKey: string) => void;
}

export function DataTableHead<T>({
  columns,
  groups,
  activeSortKey,
  activeSortDir,
  onSortClick,
}: DataTableHeadProps<T>) {
  const hasGroups = Boolean(groups && groups.length > 0);

  const renderHeaderCell = (col: DataTableColumn<T>, rowSpan?: number) => {
    const isSortable = Boolean(col.sortable);
    const isSorted = activeSortKey === col.key;
    const currentDir = isSorted ? activeSortDir : undefined;
    const ariaSort = isSorted
      ? currentDir === 'asc'
        ? 'ascending'
        : 'descending'
      : isSortable
        ? 'none'
        : undefined;

    const justify =
      col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start';

    const headerText = typeof col.header === 'string' ? col.header : col.key;

    return (
      <th
        key={col.key}
        scope="col"
        rowSpan={rowSpan}
        aria-sort={ariaSort}
        className={styles.th}
        style={{
          textAlign: col.align ?? 'left',
          borderLeft: col.borderLeft ? '1px solid var(--color-border)' : undefined,
        }}
      >
        {isSortable ? (
          <button
            type="button"
            className={styles.sortButton}
            onClick={() => onSortClick(col.key)}
            style={{ justifyContent: justify }}
            aria-label={`Sort by ${headerText}${isSorted ? ` (${currentDir === 'asc' ? 'ascending' : 'descending'})` : ''}`}
          >
            <span>{col.header}</span>
            {isSorted ? (
              currentDir === 'asc' ? (
                <ArrowUp size={13} className={styles.sortIconActive} aria-hidden="true" />
              ) : (
                <ArrowDown size={13} className={styles.sortIconActive} aria-hidden="true" />
              )
            ) : (
              <ArrowUpDown size={13} className={styles.sortIcon} aria-hidden="true" />
            )}
          </button>
        ) : (
          col.header
        )}
      </th>
    );
  };

  return (
    <thead>
      {hasGroups ? (
        <>
          <tr>
            {(() => {
              const renderedGroups = new Set<string>();
              return columns.map((col) => {
                if (!col.group) {
                  return renderHeaderCell(col, 2);
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
                      borderLeft:
                        groupDef?.borderLeft || col.borderLeft
                          ? '1px solid var(--color-border)'
                          : undefined,
                    }}
                  >
                    {groupDef?.header ?? col.group}
                  </th>
                );
              });
            })()}
          </tr>
          <tr>{columns.filter((col) => Boolean(col.group)).map((col) => renderHeaderCell(col))}</tr>
        </>
      ) : (
        <tr>{columns.map((col) => renderHeaderCell(col))}</tr>
      )}
    </thead>
  );
}
