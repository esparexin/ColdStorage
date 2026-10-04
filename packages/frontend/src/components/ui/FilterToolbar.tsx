'use client';

import React from 'react';
import { Button } from './Button';
import { SearchBar } from './SearchBar';
import { Select } from './Select';
import styles from './FilterToolbar.module.css';

export interface FilterToolbarSelect {
  id: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

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
  /**
   * Dropdown filters. Screens whose filters vary only by label declare them
   * here instead of wrapping this component in a per-feature toolbar that
   * would differ only in strings.
   */
  selects?: FilterToolbarSelect[];
  /** Arbitrary filter controls for screens that need more than a Select. */
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
  selects,
  children,
}: FilterToolbarProps) {
  const filters = (
    <>
      {selects?.map((select) => (
        <Select
          key={select.id}
          id={select.id}
          aria-label={select.ariaLabel}
          value={select.value}
          onChange={(e) => select.onChange(e.target.value)}
        >
          {select.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ))}
      {children}
    </>
  );

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

      {(selects?.length || children) && (
        <div className={styles.filterSlot}>
          {filters}
          {hasActiveFilters && (
            <Button variant="secondary" size="sm" onClick={onReset}>
              Reset
            </Button>
          )}
        </div>
      )}
    </div>
  );
}