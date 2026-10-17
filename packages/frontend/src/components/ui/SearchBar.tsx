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
  onSearch?: (value: string) => void;
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
  onSearch,
}: SearchBarProps) {
  const generatedId = React.useId();
  const searchId = id || generatedId;
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange('');
    onClear?.();
    inputRef.current?.focus();
  };

  const handleMagnifierClick = () => {
    if (onSearch) {
      onSearch(value);
    }
    inputRef.current?.focus();
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch?.(value);
    }
    onKeyDown?.(e);
  };

  return (
    <div className={`${styles.searchContainer} ${className ?? ''}`}>
      <button
        type="button"
        id={`${searchId}-magnifier-btn`}
        className={styles.magnifierButton}
        onClick={handleMagnifierClick}
        aria-label={`Search ${ariaLabel}`}
        title={`Search ${ariaLabel}`}
      >
        <Search size={16} className={styles.searchIcon} aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        id={searchId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={handleKeyDownInternal}
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
