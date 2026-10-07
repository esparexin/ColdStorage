'use client';

import React from 'react';
import type { Customer } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import type { useCustomerCombobox } from '../hooks/useCustomerCombobox';
import styles from '../page.module.css';

interface CustomerComboboxProps {
  customerBox: ReturnType<typeof useCustomerCombobox>;
  customerId: string;
  customers: Customer[];
  error?: string;
  disabled?: boolean;
  onAddCustomer: () => void;
}

export function CustomerCombobox({
  customerBox,
  customerId,
  customers,
  error,
  disabled = false,
  onAddCustomer,
}: CustomerComboboxProps) {
  const selectedCustomer = customers.find((c) => c.id === customerId);

  return (
    <div className={styles.fieldGroup}>
      <div className={styles.fieldLabelRow}>
        <label htmlFor="create-customer-search" className={styles.fieldLabel}>
          Customer *
        </label>
        {!disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={onAddCustomer}>
            + Add
          </Button>
        )}
      </div>
      <div className={styles.comboboxWrapper} ref={customerBox.wrapperRef}>
        <input
          aria-label="Search customers by name…"
          id="create-customer-search"
          type="text"
          role="combobox"
          aria-expanded={customerBox.isOpen}
          aria-autocomplete="list"
          aria-controls="customer-combobox-listbox"
          autoComplete="off"
          disabled={disabled}
          className={`${styles.comboboxInput} ${error ? styles.inputError : ''} ${disabled ? styles.calculatedField : ''}`}
          value={disabled ? (selectedCustomer?.name ?? customerBox.displayValue) : customerBox.displayValue}
          placeholder={disabled ? (selectedCustomer?.name ?? 'Customer') : 'Search customers by name…'}
          onFocus={disabled ? undefined : customerBox.open}
          onChange={(e) => {
            if (disabled) return;
            customerBox.setQuery(e.target.value);
            customerBox.setHighlightIdx(0);
          }}
          onKeyDown={disabled ? undefined : customerBox.handleKeyDown}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'customer-combobox-error' : undefined}
        />
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
        {error && (
          <span id="customer-combobox-error" className={styles.fieldErrorText} role="alert">
            {error}
          </span>
        )}
        {customerBox.isOpen && !disabled && (
          <div id="customer-combobox-listbox" className={styles.comboboxDropdown} role="listbox">
            {customerBox.matches.length > 0 ? (
              customerBox.matches.map((c, idx) => (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={c.id === customerId}
                  className={`${styles.comboboxOption} ${
                    customerBox.highlightIdx === idx ? styles.comboboxOptionActive : ''
                  }`}
                  onMouseDown={() => customerBox.choose(c.id)}
                >
                  <span className={styles.comboboxOptionName}>{c.name}</span>
                </div>
              ))
            ) : (
              <div className={styles.comboboxEmpty}>
                No customers found
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
