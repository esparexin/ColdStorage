'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Grn } from '@cold-storage/contracts';
import { Badge, SearchBar } from '@/components/ui';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './GlobalGrnSearch.module.css';

export function GlobalGrnSearch() {
  const router = useRouter();
  const { selectedFacilityId } = useFacility();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const searchGrns = useCallback(
    async (searchTerm: string) => {
      if (!selectedFacilityId || !searchTerm.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?search=${encodeURIComponent(searchTerm.trim())}&limit=8`;
        const res = await requestWithAuth(url);
        if (res.ok) {
          const data = (await res.json()) as { items?: Grn[] };
          setResults(data.items ?? []);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedFacilityId],
  );

  // Debounce search query
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    setSelectedIndex(-1);
    const timer = setTimeout(() => {
      void searchGrns(term);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, searchGrns]);

  const handleSelect = (grn: Grn) => {
    setIsOpen(false);
    setQuery('');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('select-grn', { detail: grn }));
    }
    router.push(`/grns?selectedGrnId=${encodeURIComponent(grn.id)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  if (!selectedFacilityId) return null;

  return (
    <div ref={containerRef} className={styles.container}>
      <SearchBar
        id="global-grn-search-input"
        value={query}
        onChange={setQuery}
        onFocus={() => query.trim() && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        onClear={() => {
          setQuery('');
          setResults([]);
          setIsOpen(false);
        }}
        placeholder="Search GRN #, Bill #, Customer, Bond #..."
        ariaLabel="Global GRN Search"
        className={styles.searchBar}
      />

      {isOpen && (
        <div className={styles.dropdown} role="listbox" aria-label="GRN Search Results">
          <div className={styles.dropdownHeader}>GRN Records</div>
          {loading ? (
            <div className={styles.statusMessage}>Searching GRNs...</div>
          ) : results.length === 0 ? (
            <div className={styles.statusMessage}>No GRNs found matching &ldquo;{query}&rdquo;</div>
          ) : (
            <ul className={styles.resultList}>
              {results.map((grn, idx) => (
                <li
                  key={grn.id}
                  className={`${styles.resultItem} ${idx === selectedIndex ? styles.selected : ''}`}
                  onClick={() => handleSelect(grn)}
                  role="option"
                  aria-selected={idx === selectedIndex}
                >
                  <div className={styles.itemTop}>
                    <span className={styles.grnNum}>{grn.grnNumber}</span>
                    {grn.bondNumber && (
                      <Badge variant="warning">Bond: {grn.bondNumber}</Badge>
                    )}
                    <span className={styles.dateText}>
                      {new Date(grn.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className={styles.itemSub}>
                    <span className={styles.customer}>{grn.customerName}</span>
                    <span className={styles.details}>
                      • {grn.commodityName} • {grn.bags} Bags (Chamber {grn.chamber})
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
