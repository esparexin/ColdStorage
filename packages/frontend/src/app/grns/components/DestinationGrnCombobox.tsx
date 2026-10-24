'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { seasonYearForInwardDate, type Grn } from '@cold-storage/contracts';
import { ChevronDown, Search, X } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import styles from './DestinationGrnCombobox.module.css';

export interface DestinationGrnComboboxProps {
  targetOptions: Grn[];
  targetGrnId: string;
  onSelectTarget: (id: string) => void;
  disabled?: boolean;
}

export function DestinationGrnCombobox({
  targetOptions,
  targetGrnId,
  onSelectTarget,
  disabled = false,
}: DestinationGrnComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedGrn = useMemo(
    () => targetOptions.find((g) => g.id === targetGrnId),
    [targetOptions, targetGrnId],
  );

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const term = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!term) return [];
    return targetOptions.filter(
      (g) =>
        g.grnNumber.toLowerCase().includes(term) ||
        g.customerName.toLowerCase().includes(term) ||
        g.commodityName.toLowerCase().includes(term),
    );
  }, [targetOptions, term]);

  const handleSelect = (grnId: string) => {
    onSelectTarget(grnId);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => (prev < matches.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
    } else if (e.key === 'Enter' && highlightIdx >= 0 && matches[highlightIdx]) {
      e.preventDefault();
      handleSelect(matches[highlightIdx].id);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  const displayInputValue = isOpen
    ? query
    : selectedGrn
      ? `${selectedGrn.grnNumber} — ${selectedGrn.customerName} (${selectedGrn.closingBags ?? selectedGrn.bags} bags, Season ${seasonYearForInwardDate(selectedGrn.date)})`
      : '';

  return (
    <div className={styles.comboboxWrapper} ref={wrapperRef}>
      <label htmlFor="destination-grn-combobox" className={styles.comboboxLabel}>
        Select Destination GRN
      </label>
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          id="destination-grn-combobox"
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="destination-grn-listbox"
          autoComplete="off"
          disabled={disabled}
          className={styles.comboboxInput}
          value={displayInputValue}
          placeholder="Type GRN # or customer to search (e.g. 3700)..."
          onFocus={() => {
            if (!disabled) {
              setIsOpen(true);
              setQuery('');
              setHighlightIdx(-1);
            }
          }}
          onChange={(e) => {
            if (disabled) return;
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightIdx(0);
          }}
          onKeyDown={disabled ? undefined : handleKeyDown}
        />
        <div className={styles.comboboxActions}>
          {isOpen && query && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.clearBtn}
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
            >
              <X size={14} aria-hidden="true" />
            </Button>
          )}
          <span className={styles.dropdownIcon} aria-hidden="true">
            {isOpen ? <Search size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </div>

      {isOpen && !disabled && (
        <div id="destination-grn-listbox" className={styles.comboboxDropdown} role="listbox">
          {!term ? (
            <div className={styles.emptyState}>
              Type a GRN number (e.g. 37) or customer name to search...
            </div>
          ) : matches.length > 0 ? (
            <>
              <div className={styles.dropdownHeader}>
                <span>Showing {matches.length} matching GRN{matches.length > 1 ? 's' : ''}</span>
              </div>
              {matches.map((g, idx) => (
                <div
                  key={g.id}
                  role="option"
                  aria-selected={g.id === targetGrnId}
                  className={`${styles.comboboxOption} ${
                    highlightIdx === idx ? styles.comboboxOptionActive : ''
                  } ${g.id === targetGrnId ? styles.comboboxOptionSelected : ''}`}
                  onMouseDown={() => handleSelect(g.id)}
                >
                  <div className={styles.optionMain}>
                    <div className={styles.optionHeaderRow}>
                      <span className={styles.optionGrnNumber}>{g.grnNumber}</span>
                      <Badge variant="neutral">Season {seasonYearForInwardDate(g.date)}</Badge>
                      <span className={styles.optionCustomer}>{g.customerName}</span>
                    </div>
                    <div className={styles.optionDetails}>
                      <span>{g.commodityName} (Ch. {g.chamber})</span>
                    </div>
                  </div>
                  <div className={styles.optionStock}>
                    <Badge variant="primary">{g.closingBags ?? g.bags} Bags</Badge>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className={styles.emptyState}>
              No destination GRNs found matching &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
