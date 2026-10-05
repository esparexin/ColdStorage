'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import styles from './SearchBar.module.css';

export interface SearchBarProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  onClear?: () => void;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function SearchBar({
  id,
  value,
  onChange,
  placeholder = 'Search…',
  ariaLabel,
  className,
  onClear,
  onFocus,
  onKeyDown,
}: SearchBarProps) {
  const generatedId = React.useId();
  const searchId = id || generatedId;

  const handleClear = () => {
    onChange('');
    onClear?.();
  };

  return (
    <div className={`${styles.searchContainer} ${className ?? ''}`}>
      <Search size={16} className={styles.searchIcon} aria-hidden="true" />
      <input
        id={searchId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={styles.searchInput}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className={styles.clearButton}
          aria-label={`Clear ${ariaLabel}`}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
