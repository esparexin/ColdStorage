import { useEffect, useMemo, useRef, useState } from 'react';
import type { Customer } from '@cold-storage/contracts';

export interface UseCustomerComboboxOptions {
  showAllByDefault?: boolean;
}

/**
 * Filter customers by name query.
 * When query is empty and showAllByDefault is false, returns [] to avoid
 * dumping large (100+) customer lists into the DOM by default.
 */
export function filterCustomerMatches(
  customers: Customer[],
  query: string,
  showAllByDefault = true,
): Customer[] {
  const term = query.trim().toLowerCase();
  if (term) {
    return customers.filter((c) => c.name.toLowerCase().includes(term));
  }
  return showAllByDefault ? customers : [];
}

/**
 * Keyboard-navigable customer combobox state.
 *
 * Customer identity is a single name, so matching is a plain name search.
 * Selection reporting and outside-click dismissal live here so modals stay
 * within the 250-line budget and the combobox behaviour is testable in isolation.
 */
export function useCustomerCombobox(
  customers: Customer[],
  selectedCustomerId: string,
  onSelect: (customerId: string) => void,
  onRequestAdd: () => void,
  options?: UseCustomerComboboxOptions,
) {
  const showAllByDefault = options?.showAllByDefault ?? true;
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const matches = useMemo(
    () => filterCustomerMatches(customers, query, showAllByDefault),
    [customers, query, showAllByDefault],
  );

  const open = () => {
    setIsOpen(true);
    setQuery('');
    setHighlightIdx(-1);
  };

  const choose = (customerId: string) => {
    onSelect(customerId);
    setIsOpen(false);
    setQuery('');
  };

  const clear = () => {
    onSelect('');
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        open();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (matches.length > 0) {
        setHighlightIdx((p) => (p < matches.length - 1 ? p + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length > 0) {
        setHighlightIdx((p) => (p > 0 ? p - 1 : matches.length - 1));
      }
    } else if (e.key === 'Enter' && highlightIdx >= 0 && matches[highlightIdx]) {
      e.preventDefault();
      choose(matches[highlightIdx].id);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return {
    query,
    isOpen,
    highlightIdx,
    matches,
    wrapperRef,
    displayValue: isOpen ? query : (customers.find((c) => c.id === selectedCustomerId)?.name ?? ''),
    open,
    close: () => setIsOpen(false),
    setQuery,
    setHighlightIdx,
    choose,
    clear,
    handleKeyDown,
    requestAdd: () => {
      onRequestAdd();
      setIsOpen(false);
    },
  };
}
