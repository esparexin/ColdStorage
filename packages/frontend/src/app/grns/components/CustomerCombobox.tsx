'use client';

import React from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import type { Customer } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import type { useCustomerCombobox } from '../hooks/useCustomerCombobox';
import styles from './CustomerCombobox.module.css';

export interface CustomerComboboxProps {
  customerBox: ReturnType<typeof useCustomerCombobox>;
  customerId: string;
  customers: Customer[];
  id?: string;
  listboxId?: string;
  label?: string;
  required?: boolean;
  addLabel?: string;
  placeholder?: string;
  emptyPrompt?: string;
  isLoading?: boolean;
  loadingText?: string;
  error?: string;
  disabled?: boolean;
  onAddCustomer?: () => void;
}

export function CustomerCombobox({
  customerBox,
  customerId,
  customers,
  id = 'create-customer-search',
  listboxId,
  label = 'Customer',
  required = false,
  addLabel = '+ Add',
  placeholder = 'Search customers by name…',
  emptyPrompt = 'Type customer name to search…',
  isLoading = false,
  loadingText = 'Loading customers…',
  error,
  disabled = false,
  onAddCustomer,
}: CustomerComboboxProps) {
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const term = customerBox.query.trim();
  const dropdownId = listboxId ?? (id === 'create-customer-search' ? 'customer-combobox-listbox' : `${id}-listbox`);

  return (
    <div className={styles.fieldGroup}>
      <div className={styles.fieldLabelRow}>
        <div className={styles.labelGroup}>
          <label htmlFor={id} className={styles.fieldLabel}>
            {label}
            {required && !label.includes('*') && (
              <span className={styles.requiredStar} aria-hidden="true">*</span>
            )}
          </label>
          {!disabled && onAddCustomer && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAddCustomer}
              className={styles.addCustomerBtn}
            >
              {addLabel}
            </Button>
          )}
        </div>
      </div>
      <div className={styles.comboboxWrapper} ref={customerBox.wrapperRef}>
        <input
          aria-label={label || 'Search customers by name…'}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={customerBox.isOpen}
          aria-autocomplete="list"
          aria-controls={dropdownId}
          autoComplete="off"
          disabled={disabled}
          className={`${styles.comboboxInput} ${error ? styles.inputError : ''} ${disabled ? styles.calculatedField : ''}`}
          value={disabled ? (selectedCustomer?.name ?? customerBox.displayValue) : customerBox.displayValue}
          placeholder={disabled ? (selectedCustomer?.name ?? 'Customer') : placeholder}
          onFocus={disabled ? undefined : customerBox.open}
          onChange={(e) => {
            if (disabled) return;
            customerBox.setQuery(e.target.value);
            customerBox.setHighlightIdx(0);
          }}
          onKeyDown={disabled ? undefined : customerBox.handleKeyDown}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <div className={styles.comboboxActions}>
          {customerId && !customerBox.isOpen && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.comboboxClearBtn}
              onClick={customerBox.clear}
              aria-label="Clear customer selection"
            >
              ✕
            </Button>
          )}
          <span className={styles.dropdownIcon} aria-hidden="true">
            {customerBox.isOpen ? <Search size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
        {error && (
          <span id={`${id}-error`} className={styles.fieldErrorText} role="alert">
            {error}
          </span>
        )}
        {customerBox.isOpen && !disabled && (
          <div id={dropdownId} className={styles.comboboxDropdown} role="listbox">
            {isLoading ? (
              <div className={styles.comboboxPrompt} role="status">
                <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                <span>{loadingText}</span>
              </div>
            ) : customers.length === 0 ? (
              <div className={styles.comboboxEmpty} role="status">
                <span>No customers registered yet.</span>
                {onAddCustomer && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      customerBox.requestAdd();
                    }}
                  >
                    + Add Customer
                  </Button>
                )}
              </div>
            ) : !term && customerBox.matches.length === 0 ? (
              <div className={styles.comboboxPrompt} role="status">
                <span>{emptyPrompt}</span>
              </div>
            ) : customerBox.matches.length > 0 ? (
              customerBox.matches.map((c, idx) => (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={c.id === customerId}
                  className={`${styles.comboboxOption} ${
                    customerBox.highlightIdx === idx ? styles.comboboxOptionActive : ''
                  } ${c.id === customerId ? styles.comboboxOptionSelected : ''}`}
                  onMouseDown={() => customerBox.choose(c.id)}
                >
                  <span className={styles.comboboxOptionName}>{c.name}</span>
                </div>
              ))
            ) : (
              <div className={styles.comboboxEmpty} role="status">
                <span>No customers found matching &ldquo;{customerBox.query}&rdquo;</span>
                {onAddCustomer && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      customerBox.requestAdd();
                    }}
                  >
                    + Add Customer
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
