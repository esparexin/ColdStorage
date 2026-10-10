'use client';

import React, { useEffect, useState } from 'react';
import type { Grn, Group } from '@cold-storage/contracts';
import { Banner, Button, FeedbackStates, Modal } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface AssignGrnsModalProps {
  selectedFacilityId: string;
  group: Group;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignGrnsModal({
  selectedFacilityId,
  group,
  onClose,
  onSuccess,
}: AssignGrnsModalProps) {
  const [eligibleGrns, setEligibleGrns] = useState<Grn[]>([]);
  const [selectedGrnIds, setSelectedGrnIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchEligible = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/groups/eligible-grns?limit=100`;
        const res = await requestWithAuth(url);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Error ${res.status}`);
        }
        const data = (await res.json()) as { items?: Grn[] };
        if (active) {
          setEligibleGrns(data.items ?? []);
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load eligible GRNs');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchEligible();
    return () => {
      active = false;
    };
  }, [selectedFacilityId]);

  const toggleSelect = (grnId: string) => {
    setSelectedGrnIds((prev) => {
      const next = new Set(prev);
      if (next.has(grnId)) next.delete(grnId);
      else next.add(grnId);
      return next;
    });
  };

  const filteredGrns = eligibleGrns.filter((g) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      g.grnNumber.toLowerCase().includes(q) ||
      g.commodityName.toLowerCase().includes(q) ||
      g.chamber.toLowerCase().includes(q) ||
      (g.customerName && g.customerName.toLowerCase().includes(q))
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGrnIds.size === 0) {
      setError('Please select at least one GRN to assign');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/groups/${encodeURIComponent(group.id)}/grns`;
      const res = await requestWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grnIds: Array.from(selectedGrnIds) }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign GRNs');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Assign GRNs to ${group.name}`} size="lg">
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        {error && <Banner message={error} />}

        <div className={styles.fieldGroup}>
          <label htmlFor="assign-search-grns" className={styles.fieldLabel}>
            Search Unassigned GRNs
          </label>
          <input
            id="assign-search-grns"
            type="text"
            className={styles.fieldInput}
            placeholder="Search by GRN #, commodity, chamber…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <FeedbackStates.Loading label="Loading unassigned GRNs…" />
        ) : filteredGrns.length === 0 ? (
          <FeedbackStates.Empty message="No unassigned GRNs available for assignment." />
        ) : (
          <div className={styles.grnPickerList} role="listbox" aria-label="Select GRNs to assign">
            {filteredGrns.map((grn) => {
              const isSelected = selectedGrnIds.has(grn.id);
              return (
                <div
                  key={grn.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`${styles.grnPickerItem} ${isSelected ? styles.grnPickerItemActive : ''}`}
                  onClick={() => toggleSelect(grn.id)}
                >
                  <div>
                    <strong>GRN #{grn.grnNumber}</strong> — {grn.commodityName} ({grn.bags} bags, Chamber {grn.chamber})
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      Trader: {grn.customerName} | Receipt #{grn.inwardReceiptNumber} | Status: {grn.status}
                    </div>
                  </div>
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(grn.id)}
                        aria-label={`Select GRN ${grn.grnNumber}`}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.modalFooter}>
          <span style={{ fontSize: 'var(--text-sm)', marginRight: 'auto', color: 'var(--color-text-secondary)' }}>
            {selectedGrnIds.size} {selectedGrnIds.size === 1 ? 'GRN' : 'GRNs'} selected
          </span>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            id="submit-assign-grns-btn"
            type="submit"
            variant="primary"
            isLoading={submitting}
            disabled={selectedGrnIds.size === 0}
          >
            Assign Selected
          </Button>
        </div>
      </form>
    </Modal>
  );
}
