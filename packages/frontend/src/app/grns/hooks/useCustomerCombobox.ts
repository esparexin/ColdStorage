import { useEffect, useMemo, useRef, useState } from 'react';
import type { Customer } from '@cold-storage/contracts';

/**
 * Keyboard-navigable customer combobox state for the inward GRN form.
 *
 * Customer identity is now a single name, so matching is a plain name search. Selection
 * reporting and the outside-click dismissal live here so `CreateGrnModal` stays within the
 * 250-line budget and the combobox behaviour is testable in isolation.
 */
export function useCustomerCombobox(
  customers: Customer[],
  selectedCustomerId: string,
  onSelect: (customerId: string) => void,
  onRequestAdd: () => void,
) {
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

  const term = query.trim().toLowerCase();
  const matches = useMemo(
    () => (term ? customers.filter((c) => c.name.toLowerCase().includes(term)) : customers),
    [customers, term],
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
      setHighlightIdx((p) => (p < matches.length - 1 ? p + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((p) => (p > 0 ? p - 1 : matches.length - 1));
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