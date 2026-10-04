'use client';

import React from 'react';
import { Button } from './Button';
import { SearchBar } from './SearchBar';
import styles from './FilterToolbar.module.css';

export interface FilterToolbarProps {
  /** Current search text (drives the Reset button visibility). */
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  searchInputId?: string;
  /**
   * Invoked by the SearchBar clear affordance and the Reset button.
   * Pass a full filter reset, or a search-only clear — call sites differ.
   */
  onReset: () => void;
  /** Omit to render no Reset button (read-only filter sets). */
  hasActiveFilters?: boolean;
  /** Filter controls (typically `Select` primitives). */
  children?: React.ReactNode;
}

export function FilterToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  searchInputId,
  onReset,
  hasActiveFilters,
  children,
}: FilterToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.searchSlot}>
        <SearchBar
          id={searchInputId}
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          ariaLabel={searchAriaLabel}
          onClear={onReset}
        />
      </div>

      {children && (
        <div className={styles.filterSlot}>
          {children}
          {hasActiveFilters && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onReset}
            >
              Reset
            </Button>
          )}
        </div>
      )}
    </div>
  );
}