'use client';

import React, { useState } from 'react';
import type { Customer } from '@cold-storage/contracts';
import { Banner, Button, Modal, Select } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface CreateGroupModalProps {
  selectedFacilityId: string;
  customers: Customer[];
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateGroupModal({
  selectedFacilityId,
  customers,
  onClose,
  onSuccess,
}: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Group name is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/groups`;
      const res = await requestWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          customerId: customerId || undefined,
          remarks: remarks.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Create Group" size="md">
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        {error && <Banner message={error} />}

        <div className={styles.fieldGroup}>
          <label htmlFor="create-group-name" className={styles.fieldLabel}>
            Group / Trader Name *
          </label>
          <input
            id="create-group-name"
            type="text"
            className={styles.fieldInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ramesh Agro Traders"
            maxLength={50}
            required
            autoFocus
          />
        </div>

        <div className={styles.fieldGroup}>
          <Select
            id="create-group-customer"
            label="Linked Registered Trader (Optional)"
            value={customerId}
            onChange={(e) => {
              const val = e.target.value;
              setCustomerId(val);
              if (!name && val) {
                const match = customers.find((c) => c.id === val);
                if (match) setName(match.name);
              }
            }}
          >
            <option value="">None (Standalone Trader Group)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="create-group-remarks" className={styles.fieldLabel}>
            Remarks (Optional)
          </label>
          <textarea
            id="create-group-remarks"
            className={styles.fieldTextarea}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. 2026 Inward lot consignments"
            maxLength={500}
          />
        </div>

        <div className={styles.modalFooter}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button id="submit-create-group-btn" type="submit" variant="primary" isLoading={submitting}>
            Create Group
          </Button>
        </div>
      </form>
    </Modal>
  );
}
